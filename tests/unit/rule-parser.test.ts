import { describe, expect, it } from 'vitest';
import { parseIntakeRules, detectUpdateIntent } from '@/lib/intake/parser/rule-parser';
import { newListingTemplateMessage } from '@/lib/intake/messages';

// Table-driven corpus. `expected` is a partial — only listed keys are asserted.
const CASES: Array<{
  name: string;
  input: string;
  expected: Partial<ReturnType<typeof parseIntakeRules>>;
}> = [
  {
    name: 'english happy path (the e2e fixture)',
    input: '2 bedroom house at 12 E2E Lane, Nugegoda for 80000 per month',
    expected: {
      bedrooms: 2,
      propertyType: 'house',
      address: '12 E2E Lane',
      city: 'Nugegoda',
      district: 'Colombo',
      rentPerMonth: 80000,
      title: '2BR House in Nugegoda',
      missingFields: [],
      suspicious: false,
    },
  },
  {
    name: 'full ad with No. address and attached bath',
    input:
      'No. 45/2, Temple Road, Dehiwala. 3 bedroom upstairs house with attached bathroom, rent Rs. 95,000',
    expected: {
      bedrooms: 3,
      bathrooms: 1,
      propertyType: 'house',
      address: 'No. 45/2, Temple Road',
      city: 'Dehiwala',
      district: 'Colombo',
      rentPerMonth: 95000,
      missingFields: [],
    },
  },
  {
    name: 'bare k rent shorthand',
    input: '2BR apartment Wattala 85k',
    expected: {
      bedrooms: 2,
      propertyType: 'apartment',
      city: 'Wattala',
      district: 'Gampaha',
      rentPerMonth: 85000,
      title: '2BR Apartment in Wattala',
    },
  },
  {
    name: 'lakh conversion',
    input: 'Luxury house in Colombo 7, 4 bedrooms, 1.2 lakh per month',
    expected: { rentPerMonth: 120000, city: 'Colombo 7', bedrooms: 4 },
  },
  {
    name: 'whole lakh',
    input: 'House Rajagiriya 1 lakh rent, 3 beds',
    expected: { rentPerMonth: 100000, city: 'Rajagiriya', bedrooms: 3 },
  },
  {
    name: 'LKR prefix no space',
    input: 'Apartment Colombo 3 LKR85000 2BR',
    expected: { rentPerMonth: 85000, city: 'Colombo 3', bedrooms: 2 },
  },
  {
    name: 'comma-grouped slash-month',
    input: '120,000/month 3 bedroom house Battaramulla',
    expected: { rentPerMonth: 120000, bedrooms: 3, city: 'Battaramulla' },
  },
  {
    name: 'pm suffix with k',
    input: '2 bed annex Maharagama 55k pm',
    expected: {
      rentPerMonth: 55000,
      bedrooms: 2,
      propertyType: 'house',
      title: '2BR Annex in Maharagama',
    },
  },
  {
    name: 'SL classifieds /- style',
    input: 'House for rent Kandy 3BR 75,000/- monthly',
    expected: { rentPerMonth: 75000, bedrooms: 3, city: 'Kandy', district: 'Kandy' },
  },
  {
    name: 'rent keyword proximity',
    input: 'Nice house in Galle, rent is 45,000',
    expected: { rentPerMonth: 45000, city: 'Galle', district: 'Galle' },
  },
  {
    name: 'phone number never read as rent',
    input: 'Room for rent in Kandy, call 0771234567',
    expected: { rentPerMonth: null, propertyType: 'room', city: 'Kandy' },
  },
  {
    name: 'phone with +94 masked, k rent kept',
    input: 'Contact +94771234567. 2BR house Homagama rent 60k',
    expected: { rentPerMonth: 60000, bedrooms: 2, city: 'Homagama' },
  },
  {
    name: 'deposit amount not taken as rent',
    input: '85k deposit required, rent negotiable, house in Panadura',
    expected: { rentPerMonth: null, city: 'Panadura', district: 'Kalutara' },
  },
  {
    name: 'rent wins over larger deposit',
    input: 'Rent 85,000/month, 170,000 deposit. 2BR flat Nawala',
    expected: { rentPerMonth: 85000, bedrooms: 2, propertyType: 'apartment', city: 'Nawala' },
  },
  {
    name: 'sinhala-english mix (romanized)',
    input: 'Nugegoda gedara kuliya 85k kamara 2',
    expected: {
      propertyType: 'house',
      city: 'Nugegoda',
      rentPerMonth: 85000,
      bedrooms: 2,
      title: '2BR House in Nugegoda',
    },
  },
  {
    name: 'sinhala script city alias',
    input: 'නුගේගොඩ house 2BR 70k',
    expected: { city: 'Nugegoda', bedrooms: 2, rentPerMonth: 70000 },
  },
  {
    name: 'bhk style bedrooms',
    input: '3 BHK apartment Kiribathgoda 90000 monthly',
    expected: { bedrooms: 3, propertyType: 'apartment', rentPerMonth: 90000, city: 'Kiribathgoda' },
  },
  {
    name: 'bedrooms after keyword',
    input: 'House Moratuwa. Bedrooms: 4, bathrooms: 2. 110k',
    expected: { bedrooms: 4, bathrooms: 2, rentPerMonth: 110000, city: 'Moratuwa' },
  },
  {
    name: 'bedroom text never classifies type as room',
    input: '2 bedroom apartment in Kelaniya 65k',
    expected: { propertyType: 'apartment', bedrooms: 2 },
  },
  {
    name: 'single room rental',
    input: 'Single room for rent in Peradeniya 25000 per month',
    expected: { propertyType: 'room', rentPerMonth: 25000, city: 'Peradeniya', bedrooms: null },
  },
  {
    name: 'annex maps to house, title says Annex',
    input: 'Annex for rent in Kohuwala, 1 bedroom, 45000 per month',
    expected: {
      propertyType: 'house',
      title: '1BR Annex in Kohuwala',
      bedrooms: 1,
      rentPerMonth: 45000,
    },
  },
  {
    name: 'ward number with leading zero',
    input: 'Apartment colombo 05 for rent 100k 2BR',
    expected: { city: 'Colombo 5', district: 'Colombo' },
  },
  {
    name: 'named ward alias',
    input: '2BR in Wellawatte 95k apartment',
    expected: { city: 'Colombo 6', district: 'Colombo' },
  },
  {
    name: 'mt lavinia alias',
    input: 'House mt lavinia 3 bed 120k',
    expected: { city: 'Mount Lavinia', district: 'Colombo' },
  },
  {
    name: 'address segment keeps unknown area, drops city dupe',
    input: '2BR house, 23 Lake Lane, Nugegoda, 80k monthly',
    expected: { address: '23 Lake Lane', city: 'Nugegoda' },
  },
  {
    name: 'unknown city stays null; known type still composes a cityless title',
    input: '2 bedroom house 50000 per month in Springfield',
    expected: { city: null, title: '2BR House', missingFields: ['address', 'city'] },
  },
  {
    name: 'district inferred from city, never stated',
    input: 'Apartment in Negombo 2BR 55k',
    expected: { city: 'Negombo', district: 'Gampaha' },
  },
  {
    name: 'no city → city missing, title survives on the type',
    input: '2 bedroom house for 80000 per month',
    expected: { city: null, title: '2BR House', missingFields: ['address', 'city'] },
  },
  {
    name: 'cityless title without bedrooms is just the type',
    input: 'Apartment for rent, 50000 per month',
    expected: { title: 'Apartment', propertyType: 'apartment', city: null },
  },
  {
    name: 'cityless annex title',
    input: 'Annex for rent, 1 bedroom, 45000 per month',
    expected: { title: '1BR Annex', propertyType: 'house' },
  },
  {
    name: 'no type and no city still blocks the title',
    input: '2 bedroom unit for 80000 per month',
    expected: {
      title: null,
      propertyType: null,
      city: null,
      missingFields: ['title', 'address', 'city'],
    },
  },
  {
    name: 'type-unknown with city keeps the Property label',
    input: '2 bedroom in Nugegoda 80k',
    expected: { title: '2BR Property in Nugegoda', city: 'Nugegoda' },
  },
  {
    name: 'image-only / empty text',
    input: '',
    expected: {
      title: null,
      address: null,
      city: null,
      bedrooms: null,
      rentPerMonth: null,
      description: null,
      suspicious: false,
    },
  },
  {
    name: 'whatsapp formatting stripped',
    input: '*2BR house* in _Kadawatha_ ~old price~ 58k',
    expected: { bedrooms: 2, city: 'Kadawatha', rentPerMonth: 58000 },
  },
  {
    name: 'drive street suffix',
    input: '4 bedroom house at 78 Lake Drive, Kandy. Rent 120000 per month.',
    expected: { address: '78 Lake Drive', city: 'Kandy', rentPerMonth: 120000 },
  },
  {
    name: 'marine drive apartment',
    input: '2BR apartment 130/5 Marine Drive Dehiwala 95k monthly',
    expected: { address: '130/5 Marine Drive', city: 'Dehiwala' },
  },
  {
    name: 'crescent street suffix',
    input: 'House at 12 Palm Crescent, Wattala, 3 beds, 75000 per month',
    expected: { address: '12 Palm Crescent', city: 'Wattala' },
  },
  {
    name: 'close street suffix',
    input: '5 Rose Close, Battaramulla — 3 bedroom house, rent 110,000',
    expected: { address: '5 Rose Close', city: 'Battaramulla' },
  },
  {
    name: 'sinhala pedesa suffix',
    input: 'නිවස 34 සමගි පෙදෙස, මහරගම. කාමර 3. කුලිය 65000',
    expected: { address: '34 සමගි පෙදෙස', city: 'Maharagama' },
  },
  {
    name: 'utility per-month amount never beats the labelled rent',
    input: 'Electricity around 5k per month extra. Rent 50k. Nugegoda 2BR house at 10 Temple Road',
    expected: { rentPerMonth: 50000, city: 'Nugegoda' },
  },
  {
    name: 'service charge excluded from rent',
    input: '2BR apartment Colombo 5, rent 95k, service charge 15k per month, 12 Ward Place',
    expected: { rentPerMonth: 95000, city: 'Colombo 5' },
  },
  {
    name: 'daily short-stay rate is not monthly rent',
    input: 'Daily rent 7,000. Room in Bentota near beach, 1 bed',
    expected: { rentPerMonth: null },
  },
  {
    name: 'per night rate is not monthly rent',
    input: 'Villa in Hikkaduwa 15,000 per night, 3 bedrooms',
    expected: { rentPerMonth: null },
  },
  {
    name: 'availability year is not rent',
    input: 'House available for rent from April 2026, Matara, 3BR, 70k',
    expected: { rentPerMonth: 70000, city: 'Matara' },
  },
  {
    name: 'USD amount never publishes at LKR face value',
    input: 'Luxury apartment Colombo 3, 3BR, USD 1,500 per month',
    expected: { rentPerMonth: null, city: 'Colombo 3' },
  },
  {
    name: 'bare round number is read as rent (the screenshot sign-off)',
    input:
      'House for rent in Angoda\n5 bedrooms, 3 bathrooms, parking, roller shutter gate, 4.5 perches, 700m to the Kolonnawa junction\n\n220, Flower road, Gampaha\n\n47000',
    expected: {
      rentPerMonth: 47000,
      bedrooms: 5,
      bathrooms: 3,
      city: 'Gampaha',
      district: 'Gampaha',
      address: '220, Flower road',
    },
  },
  {
    name: 'address-line city beats a landmark town mentioned in prose',
    input: 'House for rent 700m from the Kolonnawa junction, 12 Flower Road, Gampaha 55000',
    expected: { city: 'Gampaha', district: 'Gampaha', rentPerMonth: 55000 },
  },
  {
    name: 'bare number without a rental context is not grabbed as rent',
    input: 'My house address is 45000 Lake Road area',
    expected: { rentPerMonth: null },
  },
  {
    name: 'bare sqft area is not read as rent',
    input: 'House for rent in Malabe, 2500 sqft, call me',
    expected: { rentPerMonth: null, city: 'Malabe' },
  },
  {
    name: 'bare deposit amount is not read as rent',
    input: 'Room for rent Maharagama. deposit 30000',
    expected: { rentPerMonth: null, city: 'Maharagama' },
  },
  {
    name: 'road named after a town is not the city',
    input: '2BR house, 45 Negombo Road, Ja-Ela, 60000 per month',
    expected: { city: 'Ja-Ela', address: '45 Negombo Road' },
  },
  {
    name: 'road name skipped, real city and district win',
    input: 'House on 22 Kurunegala Road, Kandy. 3BR rent 80k',
    expected: { city: 'Kandy', district: 'Kandy' },
  },
  {
    name: 'ordinal 1st is not a street address',
    input: '2BR 1st floor apartment in Dehiwala, 55,000 monthly',
    expected: { address: null, rentPerMonth: 55000 },
  },
  {
    name: 'available from 1st August is not an address',
    input: '2BR house in Nugegoda 55k per month, available from 1st August',
    expected: { address: null, rentPerMonth: 55000 },
  },
  {
    name: 'house with N rooms stays a house',
    input: 'House with 2 rooms for rent in Kandy, 35,000 per month',
    expected: { propertyType: 'house' },
  },
  {
    name: 'plain rooms-for-rent still classifies as room',
    input: 'Rooms for rent near campus Malabe 20k per month',
    expected: { propertyType: 'room' },
  },
  {
    name: 'multi-property message flagged',
    input: 'I have two houses for rent. One in Nugegoda 3BR 80k, another in Maharagama 2BR 55k',
    expected: { multiProperty: true },
  },
  {
    name: 'single property with deposit is not multi-property',
    input: '2BR house Nugegoda 80k per month, deposit 160k, at 12 Lake Lane',
    expected: { multiProperty: false, rentPerMonth: 80000 },
  },
  {
    name: 'address-adjacent city beats a city mentioned elsewhere',
    input: 'I stay in Nugegoda. House at 10 Temple Road, Kandy. 2BR 45k',
    expected: { city: 'Kandy', address: '10 Temple Road' },
  },
  {
    name: 'suffix-less address: number + village names (live-found case)',
    input:
      '2 bedroom house at 3102 Gamapaha, Gampaha for 20000 per month. 3 bedrooms.\n220/A, Mackwatte, Asgiriya Gampaha',
    expected: {
      address: '220/A, Mackwatte, Asgiriya',
      city: 'Gampaha',
      rentPerMonth: 20000,
      bedrooms: 2,
    },
  },
  {
    name: 'suffix-less address with No prefix',
    input: 'Annex for rent. No. 45/2, Wewelduwa, Kelaniya. 1 bedroom, 30000 per month',
    expected: { address: 'No. 45/2, Wewelduwa', city: 'Kelaniya' },
  },
  {
    name: 'rent amount before comma never becomes a house number',
    input: 'House in Wattala, 2BR, rent 4500, Wattala side',
    expected: { address: null },
  },
  {
    name: 'deposit amount before comma never becomes a house number',
    input: 'deposit 160k, Negombo area, 2BR annex 35000 per month',
    expected: { address: null, rentPerMonth: 35000 },
  },
  {
    name: 'year before comma never becomes a house number',
    input: 'Available from 2026, Colombo apartment, 2BR 95k',
    expected: { address: null },
  },
  {
    name: 'five-digit amount before comma never becomes a house number',
    input: 'Price 20000, Ragama, negotiable, 2 bedrooms',
    expected: { address: null },
  },
  {
    name: 'lowercase chat filler never becomes an address',
    input: 'call me after 7, thanks, bye. 2BR house Kadawatha 55k',
    expected: { address: null, city: 'Kadawatha' },
  },
  {
    name: 'number + city alone is not an address',
    input: 'Apartment at 3102, Gampaha for 20000 per month, 2 bedrooms',
    expected: { address: null, city: 'Gampaha' },
  },
  {
    name: 'sinhala suffix-less address',
    input: 'නිවස කුලියට. 34/1, පල්ලෙගම, මහරගම. කාමර 3. කුලිය 45000',
    expected: { address: '34/1, පල්ලෙගම', city: 'Maharagama' },
  },
  {
    name: 'fallback segment trims trailing prose',
    input: '12/B, Kandana Estate for rent, Ja-Ela, 3 bedrooms, 60000 per month',
    expected: { address: '12/B, Kandana Estate' },
  },
  {
    name: 'address after "for rent." sentence boundary still parses',
    input: 'House for rent. 220/A, Mackwatte, Asgiriya Gampaha. 2BR 20000 per month',
    expected: { address: '220/A, Mackwatte, Asgiriya', city: 'Gampaha' },
  },
  {
    name: 'sinhala fallback stops at field words without a period',
    input: '34/1, පල්ලෙගම, මහරගම කාමර 3 කුලිය 45000',
    expected: { address: '34/1, පල්ලෙගම', city: 'Maharagama', rentPerMonth: 45000 },
  },
  {
    name: 'area/sqft numbers never become addresses',
    input: 'area 1200, Sqft Modern, Galle house 80k',
    expected: { address: null, city: 'Galle' },
  },
  {
    name: 'dimension + room words never become addresses',
    input: 'size 20/25, Kitchen And Hall, Matara house 40k pm',
    expected: { address: null, city: 'Matara' },
  },
  {
    name: 'kolonnawa resolves and only truly-absent fields are missing (live-found case)',
    input:
      'House for rent in Kolonnawa\n5 bedrooms, 3 bathrooms, parking, roller shutter gate, 4.5 perches, 700m to the Kolonnawa junction',
    expected: {
      city: 'Kolonnawa',
      district: 'Colombo',
      propertyType: 'house',
      bedrooms: 5,
      bathrooms: 3,
      title: '5BR House in Kolonnawa',
      // No address asked for — Kolonnawa is a town we recognise.
      missingFields: ['rentPerMonth'],
    },
  },
  {
    name: 'tamil full ad: house, counts, rent, street address',
    input:
      'வீடு வாடகைக்கு யாழ்ப்பாணம். 3 படுக்கையறை, 2 குளியலறை. மாத வாடகை 45,000. 12, கோயில் வீதி',
    expected: {
      propertyType: 'house',
      city: 'Jaffna',
      district: 'Jaffna',
      bedrooms: 3,
      bathrooms: 2,
      rentPerMonth: 45000,
      address: '12, கோயில் வீதி',
      title: '3BR House in Jaffna',
      missingFields: [],
    },
  },
  {
    name: 'tamil apartment with ரூ currency and keyword-first bedrooms',
    input: 'வவுனியா அடுக்குமாடி குடியிருப்பு வாடகைக்கு. படுக்கையறை 2. வாடகை ரூ. 60,000',
    expected: {
      propertyType: 'apartment',
      city: 'Vavuniya',
      bedrooms: 2,
      rentPerMonth: 60000,
      title: '2BR Apartment in Vavuniya',
    },
  },
  {
    name: 'tamil அறை room count and மாதம் rent suffix',
    input: 'மட்டக்களப்பு வீடு. அறைகள்: 3. 35,000 மாதம்',
    expected: {
      propertyType: 'house',
      city: 'Batticaloa',
      bedrooms: 3,
      rentPerMonth: 35000,
      title: '3BR House in Batticaloa',
    },
  },
  {
    name: 'tamil தெரு address, adjacent city segment dropped',
    input: 'வீடு வாடகைக்கு. 45/2, பெரிய தெரு, மன்னார். மாத வாடகை 30,000',
    expected: {
      address: '45/2, பெரிய தெரு',
      city: 'Mannar',
      district: 'Mannar',
      rentPerMonth: 30000,
    },
  },
  {
    name: 'tamil rent amount before comma never becomes a house number',
    input: 'வீடு வாடகை 4500, யாழ்ப்பாணம் பக்கம், அறை 2',
    expected: { address: null, rentPerMonth: 4500, bedrooms: 2, city: 'Jaffna' },
  },
];

describe('parseIntakeRules', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const parsed = parseIntakeRules(c.input);
      for (const [key, value] of Object.entries(c.expected)) {
        expect(parsed[key as keyof typeof parsed], key).toEqual(value);
      }
    });
  }

  it('is deterministic', () => {
    const input = '2 bedroom house at 12 E2E Lane, Nugegoda for 80000 per month';
    expect(parseIntakeRules(input)).toEqual(parseIntakeRules(input));
  });

  it('computes missingFields against the required set', () => {
    const parsed = parseIntakeRules('house in Nugegoda');
    expect(parsed.missingFields).toContain('bedrooms');
    expect(parsed.missingFields).toContain('rentPerMonth');
    expect(parsed.missingFields).not.toContain('city');
    expect(parsed.missingFields).not.toContain('title');
    // Nugegoda is a town we know, so no street address is demanded.
    expect(parsed.missingFields).not.toContain('address');
  });

  it('requires an address only when the town is unrecognised', () => {
    expect(parseIntakeRules('house in Nugegoda 2br 60000 per month').missingFields).toEqual([]);
    // In free text an unknown town cannot be identified at all — there is no
    // field saying which word is the town — so the city is missing too, and the
    // address stays required. The city-known waiver is what makes the
    // difference, not the presence of some string.
    expect(parseIntakeRules('house in Zzyzx Village 2br 60000 per month').missingFields).toEqual([
      'address',
      'city',
    ]);
  });

  it('tags parserMeta with the rules engine', () => {
    expect(parseIntakeRules('anything').parserMeta).toEqual({ engine: 'rules', rulesVersion: 5 });
  });
});

describe('detectUpdateIntent', () => {
  const UPDATES = [
    'Please change the rent to 95,000',
    'update the description to mention the new kitchen',
    'Can you remove the last photo?',
    'delete the 2nd picture',
    'replace the photos with these',
    'add parking is available to the ad',
    'correct the number of bedrooms to 3',
    'කරුණාකර කුලිය වෙනස් කරන්න 95000 ට',
    'අන්තිම පින්තූරය මකන්න',
  ];
  for (const text of UPDATES) {
    it(`update: "${text.slice(0, 40)}"`, () => {
      expect(detectUpdateIntent(text)).toBe(true);
    });
  }

  const NOT_UPDATES = [
    // Full submissions keep their street address — never routed as updates.
    'Newly renovated 2BR house at 12 Palm Lane, Kandy. Rent 50000. We can remove old furniture.',
    'House with 3 bedrooms at 45/2, Wewelduwa, Kelaniya for 60000 per month',
    // No edit verb at all.
    '2 bedroom house in Nugegoda 80k per month',
    'Thank you so much!',
    'Is the listing live yet?',
  ];
  for (const text of NOT_UPDATES) {
    it(`not update: "${text.slice(0, 40)}"`, () => {
      expect(detectUpdateIntent(text)).toBe(false);
    });
  }
});

describe('typo-tolerant town matching', () => {
  it('publishes a misspelt town with no address at all', () => {
    // The exact submission that motivated this: a town, a typo, no street.
    const p = parseIntakeRules('House for rent at Pannupitiya, 2 bedrooms, 60000 per month');
    expect(p.city).toBe('Pannipitiya');
    expect(p.district).toBe('Colombo');
    expect(p.address).toBeNull();
    // Nothing outstanding — a recognised town stands in for the address.
    expect(p.missingFields).toEqual([]);
    expect(p.citySuggestion).toMatchObject({ from: 'Pannupitiya', confident: true });
  });

  it('still demands an address when the town is not one we know', () => {
    const p = parseIntakeRules('House for rent at Zzyzx Village, 2 bedrooms, 60000 per month');
    expect(p.missingFields).toContain('address');
  });

  it('does not invent a town from ordinary listing words', () => {
    const p = parseIntakeRules(
      'House for rent, 2 bedrooms, 60000 per month, sandy beach nearby, parking, furnished'
    );
    expect(p.city).toBeNull();
    expect(p.citySuggestion).toBeUndefined();
    expect(p.missingFields).toContain('city');
  });

  it('leaves a correctly spelled town untouched', () => {
    const p = parseIntakeRules('House for rent at Pannipitiya, 2 bedrooms, 60000 per month');
    expect(p.city).toBe('Pannipitiya');
    expect(p.citySuggestion).toBeUndefined();
  });
});

/**
 * Round-trip of the fill-in form we send on first contact.
 *
 * The template in lib/intake/messages.ts is not just copy — whatever the
 * landlord fills in comes straight back here as parser input. These cases drive
 * the REAL message rather than a hardcoded copy of it, so rewording the form
 * without checking the parser fails loudly instead of silently dropping fields.
 */
describe('intake template round-trip', () => {
  /** Fill the real template by appending values after the English labels. */
  const fill = (values: Record<string, string>): string => {
    let out = newListingTemplateMessage('Gayan');
    for (const [label, value] of Object.entries(values)) {
      const needle = `${label} - `;
      // Guard: a renamed label must fail here, not silently skip the fill.
      expect(out).toContain(needle);
      out = out.replace(needle, `${label} - ${value}`);
    }
    return out;
  };

  it('extracts every field from a fully completed form', () => {
    const p = parseIntakeRules(
      fill({
        'Property type': 'house',
        Address: 'No. 45/2, Temple Road',
        'Town / city': 'Nugegoda',
        Bedrooms: '3',
        Bathrooms: '2',
        'Monthly rent (LKR)': '85,000',
        'About the place': 'Quiet lane, close to the school',
      })
    );
    expect(p.propertyType).toBe('house');
    expect(p.city).toBe('Nugegoda');
    expect(p.district).toBe('Colombo');
    expect(p.bedrooms).toBe(3);
    expect(p.bathrooms).toBe(2);
    expect(p.rentPerMonth).toBe(85000);
    expect(p.missingFields).toEqual([]);
    expect(p.suspicious).toBe(false);
  });

  it('does not let the bathrooms line bleed into the bedroom count', () => {
    // The bathrooms label is "නාන කාමර", and කාමර is itself a bedroom keyword
    // that /(\d+)\s*(?:kamara|කාමර)/gu will match across a newline. The
    // bedrooms line sits immediately above it, ending in a digit.
    const p = parseIntakeRules(
      fill({ 'Town / city': 'Kandy', Bedrooms: '3', Bathrooms: '2', 'Monthly rent (LKR)': '60000' })
    );
    expect(p.bedrooms).toBe(3);
    expect(p.bathrooms).toBe(2);
  });

  it('reads bathrooms alone without inventing a bedroom count', () => {
    // Sharpest form of the same hazard: nothing above the bathrooms line, so a
    // stray match on කාමර would have nothing legitimate outranking it.
    const p = parseIntakeRules(fill({ 'Town / city': 'Kandy', Bathrooms: '2' }));
    expect(p.bathrooms).toBe(2);
    expect(p.bedrooms).toBeNull();
    expect(p.missingFields).toContain('bedrooms');
  });

  it('keeps the filled fields when the form is only partly completed', () => {
    const p = parseIntakeRules(
      fill({ 'Town / city': 'Maharagama', Bedrooms: '2' }) // rent deliberately blank
    );
    expect(p.city).toBe('Maharagama');
    expect(p.bedrooms).toBe(2);
    expect(p.rentPerMonth).toBeNull();
    expect(p.missingFields).toContain('rentPerMonth');
  });

  it('extracts nothing from a form sent back untouched', () => {
    // Our own label text is now parser input, and the gazetteer fuzzy-matches —
    // so "නගරය"/"நகரம்" must not be mistaken for a real town.
    const p = parseIntakeRules(newListingTemplateMessage('Gayan'));
    expect(p.bedrooms).toBeNull();
    expect(p.bathrooms).toBeNull();
    expect(p.rentPerMonth).toBeNull();
    expect(p.city).toBeNull();
    expect(p.suspicious).toBe(false);
    expect(p.citySuggestion?.confident).not.toBe(true);
  });

  it('accepts native-script values against the English labels', () => {
    const p = parseIntakeRules(
      fill({ 'Town / city': 'මහරගම', Bedrooms: '3', 'Monthly rent (LKR)': '55000' })
    );
    expect(p.city).toBe('Maharagama');
    expect(p.bedrooms).toBe(3);
    expect(p.rentPerMonth).toBe(55000);
  });
});
