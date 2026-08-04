/**
 * Deterministic location coherence, reusing the intake gazetteer. Pure.
 *
 * DESIGN RULE, do not "tighten" this: an unknown city is a SOFT note, never a
 * failure. The gazetteer holds ~165 towns against thousands in Sri Lanka, so
 * hard-failing an unmatched city would auto-hold nearly every rural listing.
 * Only genuine contradictions fail.
 */

import { matchCity, matchDistrict, matchAllCities, isCityName } from '@/lib/intake/parser/gazetteer';

export interface LocationInput {
  title?: string | null;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
}

export interface LocationAnalysis {
  /** A real contradiction — hold the listing without asking the model. */
  hardFail: boolean;
  hardReasons: string[];
  /** Observations passed to the model as context; the model adjudicates. */
  softNotes: string[];
}

/** Sri Lanka's bounding box, generously padded. */
const LK_BOUNDS = { minLat: 5.7, maxLat: 10.0, minLng: 79.3, maxLng: 82.1 };

export function checkLocationCoherence(input: LocationInput): LocationAnalysis {
  const hardReasons: string[] = [];
  const softNotes: string[] = [];

  const city = (input.city ?? '').trim();
  const district = (input.district ?? '').trim();

  // 1. The city determines its district — a mismatch is unambiguous.
  if (city && district) {
    const resolved = isCityName(city.toLowerCase());
    if (resolved && resolved.district.toLowerCase() !== district.toLowerCase()) {
      hardReasons.push(
        `City "${city}" is in ${resolved.district} district, but the listing says ${district}.`
      );
    }
  }

  // 2. Coordinates are machine-entered; outside the country is not a judgement call.
  const lat = input.latitude != null ? Number(input.latitude) : null;
  const lng = input.longitude != null ? Number(input.longitude) : null;
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
    if (
      lat < LK_BOUNDS.minLat ||
      lat > LK_BOUNDS.maxLat ||
      lng < LK_BOUNDS.minLng ||
      lng > LK_BOUNDS.maxLng
    ) {
      hardReasons.push(`Coordinates (${lat}, ${lng}) are outside Sri Lanka.`);
    }
  }

  // 3. Unknown town → soft only. See the design rule above.
  if (city && !isCityName(city.toLowerCase()) && !matchCity(city.toLowerCase())) {
    softNotes.push(`"${city}" is not in our town list (may simply be a small town).`);
  }

  // 4. A different town named in the address line. matchCity already skips
  //    town-named roads ("Negombo Road"), so this is a real signal — but a
  //    soft one, since an address may legitimately name a neighbouring area.
  if (input.address) {
    const inAddress = matchCity(input.address.toLowerCase());
    if (inAddress && city && inAddress.city.toLowerCase() !== city.toLowerCase()) {
      softNotes.push(`Address mentions "${inAddress.city}" but the city field says "${city}".`);
    }
  }

  // 5. The description naming other towns and never this one.
  if (input.description && city) {
    const mentioned = matchAllCities(input.description.toLowerCase());
    if (mentioned.length > 0 && !mentioned.some((c) => c.toLowerCase() === city.toLowerCase())) {
      softNotes.push(
        `Description mentions ${mentioned.slice(0, 3).join(', ')} but not "${city}".`
      );
    }
  }

  // 6. A district stated in the text that contradicts the district field.
  if (district && input.description) {
    const textDistrict = matchDistrict(input.description.toLowerCase());
    if (textDistrict && textDistrict.toLowerCase() !== district.toLowerCase()) {
      softNotes.push(`Description mentions ${textDistrict} district; the field says ${district}.`);
    }
  }

  return { hardFail: hardReasons.length > 0, hardReasons, softNotes };
}
