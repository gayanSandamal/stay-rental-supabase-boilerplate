/**
 * Static Sri Lanka location gazetteer for the rule-based intake parser.
 * Canonical city names match what the listing form stores free-text today
 * (seed data in lib/db/seed-sample-data.ts uses the same spellings).
 * Pure data + matchers — no runtime dependencies.
 */

export const DISTRICTS = [
  'Colombo',
  'Gampaha',
  'Kalutara',
  'Kandy',
  'Matale',
  'Nuwara Eliya',
  'Galle',
  'Matara',
  'Hambantota',
  'Jaffna',
  'Kilinochchi',
  'Mannar',
  'Vavuniya',
  'Mullaitivu',
  'Batticaloa',
  'Ampara',
  'Trincomalee',
  'Kurunegala',
  'Puttalam',
  'Anuradhapura',
  'Polonnaruwa',
  'Badulla',
  'Monaragala',
  'Ratnapura',
  'Kegalle',
] as const;

export type District = (typeof DISTRICTS)[number];

export interface GazetteerCity {
  /** Canonical form, as stored on listings.city. */
  name: string;
  district: District;
  /** Lowercase alternates: short forms, misspellings, Sinhala script. */
  aliases?: string[];
}

export const CITIES: GazetteerCity[] = [
  // Colombo district
  { name: 'Colombo', district: 'Colombo', aliases: ['කොළඹ'] },
  { name: 'Nugegoda', district: 'Colombo', aliases: ['නුගේගොඩ'] },
  { name: 'Mount Lavinia', district: 'Colombo', aliases: ['mt lavinia', 'mt. lavinia'] },
  { name: 'Dehiwala', district: 'Colombo', aliases: ['dehiwela', 'දෙහිවල'] },
  { name: 'Moratuwa', district: 'Colombo', aliases: ['මොරටුව'] },
  { name: 'Ratmalana', district: 'Colombo' },
  { name: 'Battaramulla', district: 'Colombo' },
  { name: 'Rajagiriya', district: 'Colombo' },
  { name: 'Nawala', district: 'Colombo' },
  { name: 'Kottawa', district: 'Colombo' },
  { name: 'Maharagama', district: 'Colombo', aliases: ['මහරගම'] },
  { name: 'Boralesgamuwa', district: 'Colombo' },
  { name: 'Kaduwela', district: 'Colombo' },
  { name: 'Piliyandala', district: 'Colombo' },
  { name: 'Kohuwala', district: 'Colombo' },
  { name: 'Pannipitiya', district: 'Colombo' },
  { name: 'Homagama', district: 'Colombo' },
  { name: 'Malabe', district: 'Colombo' },
  { name: 'Athurugiriya', district: 'Colombo' },
  { name: 'Kesbewa', district: 'Colombo' },
  { name: 'Avissawella', district: 'Colombo' },
  { name: 'Sri Jayawardenepura Kotte', district: 'Colombo', aliases: ['kotte'] },
  { name: 'Colombo 3', district: 'Colombo', aliases: ['kollupitiya', 'colpetty'] },
  { name: 'Colombo 4', district: 'Colombo', aliases: ['bambalapitiya'] },
  { name: 'Colombo 5', district: 'Colombo', aliases: ['narahenpita', 'havelock town'] },
  { name: 'Colombo 6', district: 'Colombo', aliases: ['wellawatte', 'wellawatta'] },
  { name: 'Colombo 7', district: 'Colombo', aliases: ['cinnamon gardens'] },
  { name: 'Colombo 8', district: 'Colombo', aliases: ['borella'] },
  { name: 'Colombo 10', district: 'Colombo', aliases: ['maradana'] },
  { name: 'Colombo 11', district: 'Colombo', aliases: ['pettah'] },
  // Gampaha district
  { name: 'Gampaha', district: 'Gampaha', aliases: ['ගම්පහ'] },
  { name: 'Negombo', district: 'Gampaha', aliases: ['negambo', 'මීගමුව'] },
  { name: 'Wattala', district: 'Gampaha' },
  { name: 'Kelaniya', district: 'Gampaha' },
  { name: 'Kiribathgoda', district: 'Gampaha' },
  { name: 'Kadawatha', district: 'Gampaha' },
  { name: 'Ja-Ela', district: 'Gampaha', aliases: ['ja ela', 'jaela'] },
  { name: 'Kandana', district: 'Gampaha' },
  { name: 'Ragama', district: 'Gampaha' },
  { name: 'Minuwangoda', district: 'Gampaha' },
  { name: 'Seeduwa', district: 'Gampaha' },
  { name: 'Katunayake', district: 'Gampaha' },
  // Kalutara district
  { name: 'Kalutara', district: 'Kalutara' },
  { name: 'Panadura', district: 'Kalutara' },
  { name: 'Horana', district: 'Kalutara' },
  { name: 'Wadduwa', district: 'Kalutara' },
  { name: 'Beruwala', district: 'Kalutara' },
  // Kandy district
  { name: 'Kandy', district: 'Kandy', aliases: ['මහනුවර'] },
  { name: 'Peradeniya', district: 'Kandy' },
  { name: 'Katugastota', district: 'Kandy' },
  { name: 'Gampola', district: 'Kandy' },
  // Matale district
  { name: 'Matale', district: 'Matale' },
  { name: 'Dambulla', district: 'Matale' },
  // Nuwara Eliya district
  { name: 'Nuwara Eliya', district: 'Nuwara Eliya' },
  { name: 'Hatton', district: 'Nuwara Eliya' },
  // Galle district
  { name: 'Galle', district: 'Galle', aliases: ['ගාල්ල'] },
  { name: 'Hikkaduwa', district: 'Galle' },
  { name: 'Ambalangoda', district: 'Galle' },
  { name: 'Bentota', district: 'Galle' },
  { name: 'Unawatuna', district: 'Galle' },
  // Matara district
  { name: 'Matara', district: 'Matara', aliases: ['මාතර'] },
  { name: 'Weligama', district: 'Matara' },
  // Hambantota district
  { name: 'Hambantota', district: 'Hambantota' },
  { name: 'Tangalle', district: 'Hambantota' },
  // North & East
  { name: 'Jaffna', district: 'Jaffna', aliases: ['යාපනය'] },
  { name: 'Kilinochchi', district: 'Kilinochchi' },
  { name: 'Mannar', district: 'Mannar' },
  { name: 'Vavuniya', district: 'Vavuniya' },
  { name: 'Mullaitivu', district: 'Mullaitivu', aliases: ['mullativu'] },
  { name: 'Batticaloa', district: 'Batticaloa' },
  { name: 'Kalmunai', district: 'Ampara' },
  { name: 'Ampara', district: 'Ampara' },
  { name: 'Trincomalee', district: 'Trincomalee', aliases: ['trinco'] },
  // North-western / North-central
  { name: 'Kurunegala', district: 'Kurunegala', aliases: ['කුරුණෑගල'] },
  { name: 'Kuliyapitiya', district: 'Kurunegala' },
  { name: 'Puttalam', district: 'Puttalam' },
  { name: 'Chilaw', district: 'Puttalam' },
  { name: 'Wennappuwa', district: 'Puttalam' },
  { name: 'Anuradhapura', district: 'Anuradhapura' },
  { name: 'Polonnaruwa', district: 'Polonnaruwa' },
  // Uva / Sabaragamuwa
  { name: 'Badulla', district: 'Badulla' },
  { name: 'Bandarawela', district: 'Badulla' },
  { name: 'Ella', district: 'Badulla' },
  { name: 'Monaragala', district: 'Monaragala' },
  { name: 'Ratnapura', district: 'Ratnapura' },
  { name: 'Embilipitiya', district: 'Ratnapura' },
  { name: 'Kegalle', district: 'Kegalle' },
  { name: 'Mawanella', district: 'Kegalle' },
];

interface Candidate {
  key: string;
  city: string;
  district: District;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Flat lookup of names + aliases, longest key first so "Nuwara Eliya" wins
// over any shorter substring candidate.
const CANDIDATES: Candidate[] = CITIES.flatMap((c) => [
  { key: c.name.toLowerCase(), city: c.name, district: c.district },
  ...(c.aliases ?? []).map((a) => ({ key: a, city: c.name, district: c.district })),
]).sort((a, b) => b.key.length - a.key.length);

const CANDIDATE_RES = CANDIDATES.map((c) => ({
  ...c,
  // Unicode-safe word boundaries (JS \b is ASCII-only, breaks on Sinhala).
  re: new RegExp(`(?:^|[^\\p{L}\\d])${escapeRegExp(c.key)}(?=$|[^\\p{L}\\d])`, 'u'),
}));

/** "colombo 5", "Colombo-07" → ward city. Wards run 1–15. */
const COLOMBO_WARD_RE = /(?:^|[^\p{L}\d])colombo\s*-?\s*0?(1[0-5]|[1-9])(?=$|[^\p{L}\d])/u;

/**
 * Finds the best city mention in lowercase text. Ward numbers beat the bare
 * "Colombo" match; otherwise longest gazetteer key wins.
 */
export function matchCity(lowerText: string): { city: string; district: District } | null {
  const ward = lowerText.match(COLOMBO_WARD_RE);
  if (ward) {
    return { city: `Colombo ${Number(ward[1])}`, district: 'Colombo' };
  }
  for (const c of CANDIDATE_RES) {
    if (c.re.test(lowerText)) return { city: c.city, district: c.district };
  }
  return null;
}

/**
 * Explicit district mention ("gampaha district" or a standalone district
 * name). Used only when no city matched — a city match already implies its
 * district.
 */
export function matchDistrict(lowerText: string): District | null {
  for (const d of DISTRICTS) {
    const key = escapeRegExp(d.toLowerCase());
    if (new RegExp(`(?:^|[^\\p{L}\\d])${key}(?:\\s+district)?(?=$|[^\\p{L}\\d])`, 'u').test(lowerText)) {
      return d;
    }
  }
  return null;
}
