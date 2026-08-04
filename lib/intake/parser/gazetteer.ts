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
  { name: 'Colombo', district: 'Colombo', aliases: ['කොළඹ', 'கொழும்பு'] },
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
  { name: 'Kolonnawa', district: 'Colombo', aliases: ['කොලොන්නාව'] },
  { name: 'Wellampitiya', district: 'Colombo', aliases: ['වැල්ලම්පිටිය'] },
  { name: 'Angoda', district: 'Colombo', aliases: ['අංගොඩ'] },
  { name: 'Mulleriyawa', district: 'Colombo', aliases: ['මුල්ලේරියාව'] },
  { name: 'Kotikawatta', district: 'Colombo', aliases: ['කොටිකාවත්ත'] },
  { name: 'Hokandara', district: 'Colombo', aliases: ['හෝකන්දර'] },
  { name: 'Thalawathugoda', district: 'Colombo', aliases: ['talawatugoda', 'තලවතුගොඩ'] },
  { name: 'Katubedda', district: 'Colombo', aliases: ['කටුබැද්ද'] },
  { name: 'Hanwella', district: 'Colombo', aliases: ['හංවැල්ල'] },
  { name: 'Padukka', district: 'Colombo', aliases: ['පාදුක්ක'] },
  { name: 'Sri Jayawardenepura Kotte', district: 'Colombo', aliases: ['kotte'] },
  { name: 'Colombo 2', district: 'Colombo', aliases: ['slave island'] },
  { name: 'Colombo 3', district: 'Colombo', aliases: ['kollupitiya', 'colpetty'] },
  { name: 'Colombo 4', district: 'Colombo', aliases: ['bambalapitiya'] },
  { name: 'Colombo 5', district: 'Colombo', aliases: ['narahenpita', 'havelock town'] },
  { name: 'Colombo 6', district: 'Colombo', aliases: ['wellawatte', 'wellawatta'] },
  { name: 'Colombo 7', district: 'Colombo', aliases: ['cinnamon gardens'] },
  { name: 'Colombo 8', district: 'Colombo', aliases: ['borella'] },
  { name: 'Colombo 9', district: 'Colombo', aliases: ['dematagoda'] },
  { name: 'Colombo 10', district: 'Colombo', aliases: ['maradana'] },
  { name: 'Colombo 11', district: 'Colombo', aliases: ['pettah'] },
  { name: 'Colombo 13', district: 'Colombo', aliases: ['kotahena'] },
  { name: 'Colombo 14', district: 'Colombo', aliases: ['grandpass'] },
  { name: 'Colombo 15', district: 'Colombo', aliases: ['mattakkuliya', 'mutwal'] },
  // Gampaha district
  { name: 'Gampaha', district: 'Gampaha', aliases: ['ගම්පහ'] },
  { name: 'Negombo', district: 'Gampaha', aliases: ['negambo', 'මීගමුව', 'நீர்கொழும்பு'] },
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
  { name: 'Nittambuwa', district: 'Gampaha', aliases: ['නිත්තඹුව'] },
  { name: 'Veyangoda', district: 'Gampaha', aliases: ['වේයන්ගොඩ'] },
  { name: 'Mirigama', district: 'Gampaha', aliases: ['මීරිගම'] },
  { name: 'Divulapitiya', district: 'Gampaha', aliases: ['දිවුලපිටිය'] },
  { name: 'Yakkala', district: 'Gampaha', aliases: ['යක්කල'] },
  { name: 'Ganemulla', district: 'Gampaha', aliases: ['ගණේමුල්ල'] },
  { name: 'Delgoda', district: 'Gampaha', aliases: ['දෙල්ගොඩ'] },
  { name: 'Biyagama', district: 'Gampaha', aliases: ['බියගම'] },
  // Kalutara district
  { name: 'Kalutara', district: 'Kalutara' },
  { name: 'Panadura', district: 'Kalutara' },
  { name: 'Horana', district: 'Kalutara' },
  { name: 'Wadduwa', district: 'Kalutara' },
  { name: 'Beruwala', district: 'Kalutara' },
  { name: 'Aluthgama', district: 'Kalutara', aliases: ['අලුත්ගම'] },
  { name: 'Matugama', district: 'Kalutara', aliases: ['මතුගම'] },
  { name: 'Bandaragama', district: 'Kalutara', aliases: ['බණ්ඩාරගම'] },
  { name: 'Ingiriya', district: 'Kalutara', aliases: ['ඉංගිරිය'] },
  // Kandy district
  { name: 'Kandy', district: 'Kandy', aliases: ['මහනුවර', 'கண்டி'] },
  { name: 'Peradeniya', district: 'Kandy' },
  { name: 'Katugastota', district: 'Kandy' },
  { name: 'Gampola', district: 'Kandy' },
  { name: 'Kundasale', district: 'Kandy' },
  { name: 'Pilimathalawa', district: 'Kandy', aliases: ['pilimatalawa', 'පිලිමතලාව'] },
  { name: 'Akurana', district: 'Kandy', aliases: ['අකුරණ'] },
  { name: 'Digana', district: 'Kandy', aliases: ['දිගන'] },
  { name: 'Kadugannawa', district: 'Kandy', aliases: ['කඩුගන්නාව'] },
  { name: 'Nawalapitiya', district: 'Kandy', aliases: ['නාවලපිටිය'] },
  // Matale district
  { name: 'Matale', district: 'Matale' },
  { name: 'Dambulla', district: 'Matale' },
  { name: 'Galewela', district: 'Matale', aliases: ['ගලේවෙල'] },
  { name: 'Sigiriya', district: 'Matale', aliases: ['සීගිරිය'] },
  // Nuwara Eliya district
  { name: 'Nuwara Eliya', district: 'Nuwara Eliya', aliases: ['நுவரெலியா'] },
  { name: 'Hatton', district: 'Nuwara Eliya', aliases: ['ஹட்டன்'] },
  { name: 'Talawakele', district: 'Nuwara Eliya', aliases: ['talawakelle', 'தலவாக்கலை'] },
  // Galle district
  { name: 'Galle', district: 'Galle', aliases: ['ගාල්ල', 'காலி'] },
  { name: 'Hikkaduwa', district: 'Galle' },
  { name: 'Ambalangoda', district: 'Galle' },
  { name: 'Bentota', district: 'Galle' },
  { name: 'Unawatuna', district: 'Galle' },
  { name: 'Elpitiya', district: 'Galle', aliases: ['ඇල්පිටිය'] },
  { name: 'Karapitiya', district: 'Galle', aliases: ['කරාපිටිය'] },
  { name: 'Ahangama', district: 'Galle', aliases: ['අහංගම'] },
  { name: 'Baddegama', district: 'Galle', aliases: ['බද්දේගම'] },
  // Matara district
  { name: 'Matara', district: 'Matara', aliases: ['මාතර', 'மாத்தறை'] },
  { name: 'Weligama', district: 'Matara' },
  { name: 'Akuressa', district: 'Matara', aliases: ['අකුරැස්ස'] },
  { name: 'Dickwella', district: 'Matara', aliases: ['dikwella', 'දික්වැල්ල'] },
  { name: 'Mirissa', district: 'Matara', aliases: ['මිරිස්ස'] },
  // Hambantota district
  { name: 'Hambantota', district: 'Hambantota' },
  { name: 'Tangalle', district: 'Hambantota' },
  { name: 'Ambalantota', district: 'Hambantota', aliases: ['අම්බලන්තොට'] },
  { name: 'Tissamaharama', district: 'Hambantota', aliases: ['thissamaharama', 'තිස්සමහාරාමය'] },
  { name: 'Beliatta', district: 'Hambantota', aliases: ['බෙලිඅත්ත'] },
  // North & East — Tamil-script aliases matter here: these are Tamil-majority
  // areas and a fully Tamil listing has no other way to resolve its city.
  { name: 'Jaffna', district: 'Jaffna', aliases: ['යාපනය', 'யாழ்ப்பாணம்', 'யாழ்'] },
  { name: 'Kilinochchi', district: 'Kilinochchi', aliases: ['கிளிநொச்சி'] },
  { name: 'Mannar', district: 'Mannar', aliases: ['மன்னார்'] },
  { name: 'Vavuniya', district: 'Vavuniya', aliases: ['வவுனியா'] },
  { name: 'Mullaitivu', district: 'Mullaitivu', aliases: ['mullativu', 'முல்லைத்தீவு'] },
  { name: 'Batticaloa', district: 'Batticaloa', aliases: ['மட்டக்களப்பு'] },
  { name: 'Kalmunai', district: 'Ampara', aliases: ['கல்முனை'] },
  { name: 'Ampara', district: 'Ampara', aliases: ['அம்பாறை'] },
  { name: 'Trincomalee', district: 'Trincomalee', aliases: ['trinco', 'திருகோணமலை'] },
  { name: 'Chavakachcheri', district: 'Jaffna', aliases: ['சாவகச்சேரி'] },
  { name: 'Point Pedro', district: 'Jaffna', aliases: ['பருத்தித்துறை', 'பருத்திதுறை'] },
  { name: 'Nallur', district: 'Jaffna', aliases: ['நல்லூர்'] },
  { name: 'Chunnakam', district: 'Jaffna', aliases: ['சுன்னாகம்'] },
  { name: 'Manipay', district: 'Jaffna', aliases: ['மானிப்பாய்'] },
  { name: 'Kattankudy', district: 'Batticaloa', aliases: ['காத்தான்குடி'] },
  { name: 'Eravur', district: 'Batticaloa', aliases: ['ஏறாவூர்'] },
  { name: 'Valaichchenai', district: 'Batticaloa', aliases: ['valaichenai', 'வாழைச்சேனை'] },
  { name: 'Akkaraipattu', district: 'Ampara', aliases: ['அக்கரைப்பற்று'] },
  { name: 'Sammanthurai', district: 'Ampara', aliases: ['சம்மாந்துறை'] },
  { name: 'Pottuvil', district: 'Ampara', aliases: ['பொத்துவில்'] },
  { name: 'Nintavur', district: 'Ampara', aliases: ['நிந்தவூர்'] },
  { name: 'Kinniya', district: 'Trincomalee', aliases: ['கிண்ணியா'] },
  { name: 'Mutur', district: 'Trincomalee', aliases: ['muthur', 'மூதூர்'] },
  { name: 'Nilaveli', district: 'Trincomalee', aliases: ['நிலாவெளி'] },
  { name: 'Kantale', district: 'Trincomalee', aliases: ['kanthale', 'கந்தளாய்'] },
  // North-western / North-central
  { name: 'Kurunegala', district: 'Kurunegala', aliases: ['කුරුණෑගල'] },
  { name: 'Kuliyapitiya', district: 'Kurunegala' },
  { name: 'Narammala', district: 'Kurunegala', aliases: ['නාරම්මල'] },
  { name: 'Wariyapola', district: 'Kurunegala', aliases: ['වාරියපොල'] },
  { name: 'Pannala', district: 'Kurunegala', aliases: ['පන්නල'] },
  { name: 'Polgahawela', district: 'Kurunegala', aliases: ['පොල්ගහවෙල'] },
  { name: 'Alawwa', district: 'Kurunegala', aliases: ['අලව්ව'] },
  { name: 'Puttalam', district: 'Puttalam' },
  { name: 'Chilaw', district: 'Puttalam' },
  { name: 'Wennappuwa', district: 'Puttalam' },
  { name: 'Marawila', district: 'Puttalam', aliases: ['මාරවිල'] },
  { name: 'Nattandiya', district: 'Puttalam', aliases: ['නාත්තණ්ඩිය'] },
  { name: 'Dankotuwa', district: 'Puttalam', aliases: ['දංකොටුව'] },
  { name: 'Kalpitiya', district: 'Puttalam', aliases: ['කල්පිටිය', 'கல்பிட்டி'] },
  { name: 'Anuradhapura', district: 'Anuradhapura' },
  { name: 'Kekirawa', district: 'Anuradhapura', aliases: ['කැකිරාව'] },
  { name: 'Polonnaruwa', district: 'Polonnaruwa' },
  { name: 'Kaduruwela', district: 'Polonnaruwa', aliases: ['කඩුරුවෙල'] },
  { name: 'Hingurakgoda', district: 'Polonnaruwa', aliases: ['හිඟුරක්ගොඩ'] },
  // Uva / Sabaragamuwa
  { name: 'Badulla', district: 'Badulla', aliases: ['பதுளை'] },
  { name: 'Bandarawela', district: 'Badulla' },
  { name: 'Ella', district: 'Badulla' },
  { name: 'Welimada', district: 'Badulla', aliases: ['වැලිමඩ'] },
  { name: 'Haputale', district: 'Badulla', aliases: ['හපුතලේ'] },
  { name: 'Mahiyanganaya', district: 'Badulla', aliases: ['mahiyangana', 'මහියංගනය'] },
  { name: 'Monaragala', district: 'Monaragala' },
  { name: 'Wellawaya', district: 'Monaragala', aliases: ['වැල්ලවාය'] },
  { name: 'Kataragama', district: 'Monaragala', aliases: ['කතරගම'] },
  { name: 'Buttala', district: 'Monaragala', aliases: ['බුත්තල'] },
  { name: 'Ratnapura', district: 'Ratnapura' },
  { name: 'Embilipitiya', district: 'Ratnapura' },
  { name: 'Balangoda', district: 'Ratnapura', aliases: ['බලංගොඩ'] },
  { name: 'Pelmadulla', district: 'Ratnapura', aliases: ['පැල්මඩුල්ල'] },
  { name: 'Eheliyagoda', district: 'Ratnapura', aliases: ['ඇහැලියගොඩ'] },
  { name: 'Kegalle', district: 'Kegalle' },
  { name: 'Mawanella', district: 'Kegalle' },
  { name: 'Warakapola', district: 'Kegalle', aliases: ['වරකාපොල'] },
  { name: 'Rambukkana', district: 'Kegalle', aliases: ['රඹුක්කන'] },
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
  re: new RegExp(`(?:^|[^\\p{L}\\d])${escapeRegExp(c.key)}(?=$|[^\\p{L}\\d])`, 'gu'),
}));

/**
 * Sri Lankan roads are routinely named after the town they lead to ("Negombo
 * Road" in Ja-Ela, "Kurunegala Road" in Kandy). A city mention immediately
 * followed by a street word is the road's name, not the listing's city.
 */
const ROAD_NAME_AFTER_RE =
  // NB: "junction" deliberately absent — "Borella Junction" names the locality.
  // Sinhala/Tamil words need the explicit lookahead: JS \b is ASCII-only and
  // never asserts after a non-Latin letter.
  /^\s*(?:(?:road|rd|street|st|mawatha|mw|lane|ln|para)\b|(?:පාර|මාවත|வீதி|தெரு|சாலை|ஒழுங்கை)(?=$|[^\p{L}\p{M}]))/iu;

function isRoadNameMention(lowerText: string, matchEnd: number): boolean {
  return ROAD_NAME_AFTER_RE.test(lowerText.slice(matchEnd, matchEnd + 12));
}

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
    c.re.lastIndex = 0;
    for (const m of lowerText.matchAll(c.re)) {
      const end = (m.index ?? 0) + m[0].length;
      if (isRoadNameMention(lowerText, end)) continue; // "Negombo Road" ≠ Negombo
      return { city: c.city, district: c.district };
    }
  }
  return null;
}

/**
 * True only when the WHOLE string is a known city name/alias (or ward form) —
 * unlike matchCity, which searches. "kandana estate" is NOT a city name even
 * though it contains one.
 */
export function isCityName(lowerText: string): { city: string; district: District } | null {
  const t = lowerText.trim();
  const ward = t.match(COLOMBO_WARD_RE);
  if (ward && ward[0].trim() === t) {
    return { city: `Colombo ${Number(ward[1])}`, district: 'Colombo' };
  }
  for (const c of CANDIDATES) {
    if (c.key === t) return { city: c.city, district: c.district };
  }
  return null;
}

/**
 * All distinct cities mentioned (road names excluded). Used only to detect
 * multi-property messages — matchCity stays the authority on THE city.
 */
export function matchAllCities(lowerText: string): string[] {
  const found = new Set<string>();
  const ward = lowerText.match(COLOMBO_WARD_RE);
  if (ward) found.add(`Colombo ${Number(ward[1])}`);
  for (const c of CANDIDATE_RES) {
    if (found.has(c.city)) continue;
    if (ward && c.city === 'Colombo') continue; // "Colombo 5" already counted
    c.re.lastIndex = 0;
    for (const m of lowerText.matchAll(c.re)) {
      const end = (m.index ?? 0) + m[0].length;
      if (isRoadNameMention(lowerText, end)) continue;
      found.add(c.city);
      break;
    }
  }
  return [...found];
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
