import { describe, expect, it } from 'vitest';
import { parseIntakeRules } from '@/lib/intake/parser/rule-parser';

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
    name: 'unknown city stays null and blocks title',
    input: '2 bedroom house 50000 per month in Springfield',
    expected: { city: null, title: null },
  },
  {
    name: 'district inferred from city, never stated',
    input: 'Apartment in Negombo 2BR 55k',
    expected: { city: 'Negombo', district: 'Gampaha' },
  },
  {
    name: 'no city → title and city missing',
    input: '2 bedroom house for 80000 per month',
    expected: { city: null, title: null },
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
    expect(parsed.missingFields).toContain('address');
    expect(parsed.missingFields).toContain('bedrooms');
    expect(parsed.missingFields).toContain('rentPerMonth');
    expect(parsed.missingFields).not.toContain('city');
    expect(parsed.missingFields).not.toContain('title');
  });

  it('tags parserMeta with the rules engine', () => {
    expect(parseIntakeRules('anything').parserMeta).toEqual({ engine: 'rules', rulesVersion: 1 });
  });
});
