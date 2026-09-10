import { describe, expect, it } from 'vitest';
import { locationDetail, withLocationDetail } from '@/lib/imports/location';
import type { ParsedIntake } from '@/lib/intake/parser/types';

/**
 * "Colombo - Kirulapone, Polhengoda." imported as city Colombo, district
 * Colombo, address null — the two searchable words dropped. Reported 2026-09-11.
 *
 * The parser cannot do this itself: ADDRESS_RE needs a street number plus a
 * street type and ADDRESS_FALLBACK_RE needs a house number, and Sri Lankan
 * adverts give landmarks. rule-parser.ts is shared with the live intake, so the
 * fix is importer-local.
 */
const ADVERT = [
  'Annex for girls',
  '🟩 Colombo - Kirulapone, Polhengoda.',
  '◽️️ Attached bathroom with Hotwater',
  '◽️️ Pantry.',
  '◽️️ Separate entrance.',
  '◽️ 24 hours CCTV coverage.',
  '◽️️ Vehicle parking space available.',
  'Close to Main Roads.',
  'For more info, 071 769 3657',
].join('\n');

const IN_COLOMBO = { city: 'Colombo', district: 'Colombo' };

describe('the reported advert', () => {
  it('keeps the suburbs the advert actually named', () => {
    expect(locationDetail(ADVERT, IN_COLOMBO)?.address).toBe('Kirulapone, Polhengoda');
  });

  it('reads through the decorative bullet without help', () => {
    expect(locationDetail('🟩 Colombo - Kirulapone, Polhengoda.', IN_COLOMBO)?.address).toBe(
      'Kirulapone, Polhengoda'
    );
  });

  it('leaves a town the gazetteer already knows alone', () => {
    const detail = locationDetail(ADVERT, IN_COLOMBO);
    expect(detail?.city).toBeUndefined();
    expect(detail?.district).toBeUndefined();
  });
});

describe('lines that are not locations', () => {
  it.each([
    ['◽️️ Attached bathroom with Hotwater', 'a feature list'],
    ['◽️️ Vehicle parking space available.', 'an amenity'],
    ['Close to Main Roads.', 'prose with no town in it'],
    ['For more info, 071 769 3657', 'a phone number'],
    ['Rent 45,000 per month, negotiable', 'a rent'],
    ['Annex for girls', 'a headline'],
  ])('refuses %s (%s)', (line) => {
    expect(locationDetail(line, IN_COLOMBO)).toBeNull();
  });

  it('needs a known town on the line, not just commas', () => {
    // Without the gazetteer hit there is nothing to say this is a location.
    expect(locationDetail('Quiet, clean, well kept', IN_COLOMBO)).toBeNull();
  });

  it('needs an unknown segment too — a bare town is already the city', () => {
    expect(locationDetail('Nugegoda, Colombo', { city: 'Nugegoda', district: 'Colombo' })).toBeNull();
  });
});

describe('city and district move as a pair, or not at all', () => {
  it('adopts both when our own town is not in the gazetteer', () => {
    const detail = locationDetail('Nugegoda - Mirihana, Off Kotte Road', {
      city: 'Somewhereville',
      district: null,
    });
    expect(detail?.city).toBe('Nugegoda');
    expect(detail?.district).toBe('Colombo');
  });

  it('never returns a city without its district', () => {
    for (const city of ['Somewhereville', null]) {
      const detail = locationDetail('Kandy - Peradeniya, Galaha Road', { city, district: null });
      if (detail?.city) expect(detail.district).toBeTruthy();
    }
  });
});

describe('withLocationDetail', () => {
  const parsed = (over: Partial<ParsedIntake> = {}) =>
    ({
      title: 'Annex in Colombo',
      propertyType: 'house',
      address: null,
      city: 'Colombo',
      district: 'Colombo',
      bedrooms: null,
      bathrooms: 1,
      rentPerMonth: null,
      description: null,
      missingFields: [],
      suspicious: false,
      suspicionReason: null,
      multiProperty: false,
      ...over,
    }) as ParsedIntake;

  it('fills an address the parser left empty', () => {
    expect(withLocationDetail(parsed(), ADVERT).address).toBe('Kirulapone, Polhengoda');
  });

  it('never overwrites an address the parser did find', () => {
    const found = parsed({ address: '220/A, Temple Road' });
    expect(withLocationDetail(found, ADVERT).address).toBe('220/A, Temple Road');
  });

  it('leaves every other field exactly as parsed', () => {
    const before = parsed();
    const after = withLocationDetail(before, ADVERT);
    expect({ ...after, address: null }).toEqual(before);
  });

  it('is a no-op on an advert with no location line', () => {
    const before = parsed();
    expect(withLocationDetail(before, 'Annex for girls\nCall 0771234567')).toEqual(before);
  });
});
