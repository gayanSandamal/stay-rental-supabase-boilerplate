import { describe, expect, it } from 'vitest';
import {
  CITIES,
  CITY_NAMES,
  DISTRICTS,
  matchCity,
  matchDistrict,
  fuzzyCityCandidates,
  fuzzyCityName,
  isDecisiveCandidate,
  normalizeLocation,
} from '@/lib/intake/parser/gazetteer';
import { computeMissingFields } from '@/lib/intake/parser/types';

describe('gazetteer data', () => {
  it('has all 25 districts', () => {
    expect(DISTRICTS).toHaveLength(25);
  });

  it('every city maps to a known district', () => {
    for (const c of CITIES) {
      expect(DISTRICTS).toContain(c.district);
    }
  });

  it('has no duplicate canonical names', () => {
    const names = CITIES.map((c) => c.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('matchCity', () => {
  it('matches a plain city with word boundaries', () => {
    expect(matchCity('house in nugegoda for rent')).toEqual({
      city: 'Nugegoda',
      district: 'Colombo',
    });
  });

  it('does not match inside a longer word', () => {
    expect(matchCity('the ellamawatta estate')).toBeNull();
  });

  it('prefers the longer name when names overlap', () => {
    expect(matchCity('12 galle road, nugegoda')?.city).toBe('Nugegoda');
  });

  it('resolves colombo ward numbers, with leading zeros', () => {
    expect(matchCity('apartment colombo 05')?.city).toBe('Colombo 5');
    expect(matchCity('colombo-7 house')?.city).toBe('Colombo 7');
    expect(matchCity('colombo 15 flat')?.city).toBe('Colombo 15');
  });

  it('falls back to bare colombo for out-of-range wards', () => {
    expect(matchCity('colombo 16 zone')?.city).toBe('Colombo');
  });

  it('resolves aliases to the canonical city', () => {
    expect(matchCity('mt lavinia beach side')?.city).toBe('Mount Lavinia');
    expect(matchCity('wellawatte sea view')?.city).toBe('Colombo 6');
    expect(matchCity('borella junction')?.city).toBe('Colombo 8');
  });

  it('matches sinhala script aliases', () => {
    expect(matchCity('නුගේගොඩ house')?.city).toBe('Nugegoda');
  });

  it('resolves kolonnawa and the east-Colombo cluster (live-found gap)', () => {
    expect(matchCity('house for rent in kolonnawa')).toEqual({
      city: 'Kolonnawa',
      district: 'Colombo',
    });
    expect(matchCity('කොලොන්නාව නිවසක්')?.city).toBe('Kolonnawa');
    for (const town of ['wellampitiya', 'angoda', 'mulleriyawa', 'kotikawatta']) {
      expect(matchCity(`2br house ${town} 45k`)?.district, town).toBe('Colombo');
    }
  });

  it('assigns newly added towns to the right districts', () => {
    expect(matchCity('kalpitiya beach house')?.district).toBe('Puttalam');
    expect(matchCity('room in kataragama')?.district).toBe('Monaragala');
    expect(matchCity('hingurakgoda house')?.district).toBe('Polonnaruwa');
    expect(matchCity('talawakele estate bungalow')?.district).toBe('Nuwara Eliya');
    expect(matchCity('house at nittambuwa')?.district).toBe('Gampaha');
  });

  it('matches tamil script aliases', () => {
    expect(matchCity('யாழ்ப்பாணம் வீடு')?.city).toBe('Jaffna');
    expect(matchCity('கொழும்பு அபார்ட்மெண்ட்')?.city).toBe('Colombo');
    expect(matchCity('மட்டக்களப்பு veedu')?.city).toBe('Batticaloa');
    expect(matchCity('திருகோணமலை house for rent')?.city).toBe('Trincomalee');
  });

  it('resolves tamil aliases to the right district', () => {
    expect(matchCity('கல்முனை house')?.district).toBe('Ampara');
    expect(matchCity('கிண்ணியா house')?.district).toBe('Trincomalee');
    expect(matchCity('காத்தான்குடி house')?.district).toBe('Batticaloa');
    expect(matchCity('பருத்தித்துறை வீடு')?.city).toBe('Point Pedro');
    expect(matchCity('பொத்துவில் வீடு')?.district).toBe('Ampara');
  });

  it('skips town-named roads in sinhala and tamil scripts', () => {
    // JS \b never asserts after a Sinhala/Tamil letter, so the road guard
    // carries its own boundary — these used to leak through as cities.
    expect(matchCity('නුගේගොඩ පාර අසල නිවස')).toBeNull();
    expect(matchCity('நீர்கொழும்பு வீதி, கண்டி')?.city).toBe('Kandy');
  });

  it('returns null for unknown places', () => {
    expect(matchCity('a house in springfield')).toBeNull();
  });
});

describe('matchDistrict', () => {
  it('matches an explicit district mention', () => {
    expect(matchDistrict('available in monaragala district')).toBe('Monaragala');
  });

  it('matches a standalone district name', () => {
    expect(matchDistrict('anywhere in gampaha is fine')).toBe('Gampaha');
  });

  it('returns null when no district appears', () => {
    expect(matchDistrict('a nice quiet neighbourhood')).toBeNull();
  });
});

describe('normalizeLocation', () => {
  it('canonicalises spelling and casing of a known town', () => {
    expect(normalizeLocation('COLOMBO')).toEqual({
      city: 'Colombo',
      district: 'Colombo',
      known: true,
    });
    expect(normalizeLocation('  pannipitiya ')).toEqual({
      city: 'Pannipitiya',
      district: 'Colombo',
      known: true,
    });
  });

  it('normalises a Colombo ward written any which way', () => {
    expect(normalizeLocation('colombo 07').city).toBe('Colombo 7');
    expect(normalizeLocation('Colombo-7').city).toBe('Colombo 7');
  });

  it('resolves an alias to its canonical name', () => {
    expect(normalizeLocation('mt lavinia').city).toBe('Mount Lavinia');
  });

  // A town implies its district, so a hand-typed one must never win: that is
  // how "Nugegoda, Gampaha" would otherwise land in the wrong 25-way bucket.
  it('derives the district from the town, overriding a wrong one', () => {
    expect(normalizeLocation('Nugegoda', 'Gampaha').district).toBe('Colombo');
  });

  // Sri Lanka has thousands of small towns; lib/moderation/location.ts treats an
  // unfamiliar one as a soft note, never a hold. Normalising must not tighten that.
  it('keeps a town it does not know rather than dropping it', () => {
    const out = normalizeLocation('Some Tiny Village', 'gampaha');
    expect(out.city).toBe('Some Tiny Village');
    expect(out.district).toBe('Gampaha');
    expect(out.known).toBe(false);
  });

  it('does not mangle hyphenated names', () => {
    expect(normalizeLocation('ja-ela').city).toBe('Ja-Ela');
  });

  it('still resolves a district when the city is blank', () => {
    expect(normalizeLocation('', 'kandy')).toEqual({
      city: '',
      district: 'Kandy',
      known: false,
    });
  });

  it('is idempotent — normalising twice changes nothing', () => {
    for (const input of ['colombo 07', 'mt lavinia', 'Some Tiny Village', 'ja-ela']) {
      const once = normalizeLocation(input);
      const twice = normalizeLocation(once.city, once.district);
      expect(twice.city).toBe(once.city);
      expect(twice.district).toBe(once.district);
    }
  });
});

describe('CITY_NAMES', () => {
  it('feeds the pickers from the same list the matcher accepts', () => {
    expect(CITY_NAMES.length).toBeGreaterThan(150);
    // Every option offered must round-trip, or the UI can offer a value the
    // filter's eq() will never match — the exact defect this replaced.
    for (const name of CITY_NAMES) {
      expect(normalizeLocation(name).city).toBe(name);
    }
  });

  it('covers the towns the intake pipeline actually produces', () => {
    for (const town of ['Pannipitiya', 'Kolonnawa', 'Dehiwala', 'Nugegoda']) {
      expect(CITY_NAMES).toContain(town);
    }
  });
});

describe('fuzzyCityName', () => {
  it('corrects the misspellings landlords actually send', () => {
    expect(fuzzyCityName('Pannupitiya')?.city).toBe('Pannipitiya');
    expect(fuzzyCityName('Nugegoada')?.city).toBe('Nugegoda');
    expect(fuzzyCityName('Maharagame')?.city).toBe('Maharagama');
    expect(fuzzyCityName('battaramula')?.city).toBe('Battaramulla');
  });

  // The load-bearing test. A wrong town is worse than no town, because nothing
  // downstream questions it — every one of these sits within an edit or two of
  // a real place name and must never match.
  it('refuses everything that merely looks like a town', () => {
    for (const word of [
      'sandy', 'randy', 'gall', 'matter', 'bedroom', 'bedrooms', 'parking',
      'furnished', 'upstairs', 'kitchen', 'balcony', 'property', 'contact',
      'monthly', 'deposit', 'security',
    ]) {
      expect(fuzzyCityName(word), word).toBeNull();
    }
  });

  it('will not guess on a word too short to be sure about', () => {
    expect(fuzzyCityName('kandi')).toBeNull(); // 5 chars — under the floor
  });

  it('requires the start of the word to match', () => {
    // One edit from "Gampaha", but the first letters differ, so it is a
    // different word rather than a typo of this one.
    expect(fuzzyCityName('Zampaha')).toBeNull();
  });

  it('only marks a long single-edit fix as confident', () => {
    expect(fuzzyCityName('Pannupitiya')?.confident).toBe(true);
    const short = fuzzyCityName('Matarra'); // 7 chars → correctable, not certain
    if (short) expect(short.confident).toBe(false);
  });

  it('leaves an exact name alone at distance 0', () => {
    expect(fuzzyCityName('Pannipitiya')).toMatchObject({ city: 'Pannipitiya', distance: 0 });
  });
});

describe('normalizeLocation with typos', () => {
  it('canonicalises a misspelt town and reports what was corrected', () => {
    const out = normalizeLocation('Pannupitiya');
    expect(out).toMatchObject({ city: 'Pannipitiya', district: 'Colombo', known: true });
    expect(out.corrected).toEqual({ from: 'Pannupitiya' });
  });

  it('is idempotent — a corrected name normalises to itself', () => {
    const once = normalizeLocation('Pannupitiya');
    const twice = normalizeLocation(once.city);
    expect(twice.city).toBe(once.city);
    expect(twice.corrected).toBeUndefined();
  });

  it('still keeps a genuine unknown town rather than forcing a match', () => {
    const out = normalizeLocation('Zzyzx Village');
    expect(out.known).toBe(false);
    expect(out.city).toBe('Zzyzx Village');
  });
});

describe('address requirement', () => {
  const base = {
    title: 'x', propertyType: null, address: null, district: null,
    bedrooms: 2, bathrooms: null, rentPerMonth: 60000, description: null,
    missingFields: [], suspicious: false, suspicionReason: null,
  };

  it('waives the address for a town we recognise', () => {
    expect(computeMissingFields({ ...base, city: 'Pannipitiya' } as any)).toEqual([]);
  });

  it('waives it for a misspelt town too, since that still resolves', () => {
    expect(computeMissingFields({ ...base, city: 'Pannupitiya' } as any)).toEqual([]);
  });

  // The safety valve: something must locate the property, so an unknown town
  // still has to come with a street.
  it('keeps requiring it for a town we do not know', () => {
    expect(computeMissingFields({ ...base, city: 'Zzyzx Village' } as any)).toEqual(['address']);
  });
});

describe('town disambiguation', () => {
  // Built-ins only here (no DB), which is enough: Gampaha and Gampola are both
  // curated, and they are the pair the sender has to choose between.
  it('asks rather than guessing between two plausible towns', () => {
    const c = fuzzyCityCandidates('Gampaga');
    expect(c.map((x) => x.city)).toContain('Gampaha');
    expect(c.map((x) => x.city)).toContain('Gampola');
    expect(isDecisiveCandidate('Gampaga', c)).toBe(false);
  });

  // The tie-break that makes the menu readable: at equal similarity, the town
  // that starts like the input wins. Without it "Ampara" outranks "Gampola"
  // for "Gampaga" purely on alphabetical order.
  it('ranks a shared opening ahead of an alphabetical accident', () => {
    const c = fuzzyCityCandidates('Gampaga');
    const gampola = c.findIndex((x) => x.city === 'Gampola');
    const ampara = c.findIndex((x) => x.city === 'Ampara');
    if (ampara !== -1) expect(gampola).toBeLessThan(ampara);
  });

  it('applies a long single-letter typo without asking', () => {
    const c = fuzzyCityCandidates('Pannupitiya');
    expect(c[0].city).toBe('Pannipitiya');
    expect(isDecisiveCandidate('Pannupitiya', c)).toBe(true);
  });

  // Short inputs are never auto-applied — one letter in five is too little to
  // be sure — but they are still worth offering as a choice.
  it('offers short near-misses without applying them', () => {
    const c = fuzzyCityCandidates('Kandi');
    expect(c[0].city).toBe('Kandy');
    expect(isDecisiveCandidate('Kandi', c)).toBe(false);
  });

  it('never offers a shortlist longer than the menu can carry', () => {
    expect(fuzzyCityCandidates('Pannupitiya').length).toBeLessThanOrEqual(3);
  });

  it('offers nothing for ordinary listing words', () => {
    for (const w of ['parking', 'bedroom', 'furnished', 'kitchen']) {
      expect(fuzzyCityCandidates(w), w).toEqual([]);
    }
  });

  it('lists each town once even when the name repeats across districts', () => {
    const names = fuzzyCityCandidates('Gampaga').map((c) => c.city);
    expect(new Set(names).size).toBe(names.length);
  });
});

/**
 * Script coverage.
 *
 * On 2026-08-23 a landlord wrote "හොරණ" and was told it was not in our town
 * list. Horana had been in the gazetteer since day one — in Latin only. The
 * town therefore never resolved, `known` stayed false, and because
 * computeMissingFields only waives the address for a RECOGNISED town, the
 * pipeline demanded a street address the landlord had already given twice.
 *
 * 99 of the 173 towns were in that state. A Sri Lankan rental marketplace
 * whose gazetteer only speaks English is not a Sri Lankan gazetteer, so this
 * asserts the floor rather than trusting anyone to remember.
 */
describe('every town is reachable in all three scripts', () => {
  const SINHALA = /[඀-෿]/;
  const TAMIL = /[஀-௿]/;
  const LATIN = /[A-Za-z]/;

  it.each(CITIES.map((c) => [c.name, c] as const))('%s has a Sinhala name', (_name, city) => {
    expect(city.aliases?.some((a) => SINHALA.test(a))).toBe(true);
  });

  it.each(CITIES.map((c) => [c.name, c] as const))('%s has a Tamil name', (_name, city) => {
    expect(city.aliases?.some((a) => TAMIL.test(a))).toBe(true);
  });

  it('resolves the town from the incident, in its own script', () => {
    expect(normalizeLocation('හොරණ')).toEqual({
      city: 'Horana',
      district: 'Kalutara',
      known: true,
    });
  });

  it('every alias is written in ONE script', () => {
    // A single Sinhala codepoint inside a Tamil word is invisible on screen and
    // makes the alias unmatchable by anyone typing it properly. Three slipped
    // in when these were first added; the same typo will not survive twice.
    const mixed: string[] = [];
    for (const city of CITIES) {
      for (const alias of city.aliases ?? []) {
        const scripts = [SINHALA, TAMIL, LATIN].filter((re) => re.test(alias)).length;
        if (scripts > 1) mixed.push(`${city.name}: ${alias}`);
      }
    }
    expect(mixed).toEqual([]);
  });

  it('every alias is lowercase, as the matchers assume', () => {
    const wrong = CITIES.flatMap((c) =>
      (c.aliases ?? []).filter((a) => a !== a.toLowerCase()).map((a) => `${c.name}: ${a}`)
    );
    expect(wrong).toEqual([]);
  });

  it('no alias points at two different towns', () => {
    const owners = new Map<string, string[]>();
    for (const city of CITIES) {
      for (const alias of city.aliases ?? []) {
        owners.set(alias, [...(owners.get(alias) ?? []), city.name]);
      }
    }
    const ambiguous = [...owners].filter(([, names]) => names.length > 1);
    expect(ambiguous).toEqual([]);
  });
});
