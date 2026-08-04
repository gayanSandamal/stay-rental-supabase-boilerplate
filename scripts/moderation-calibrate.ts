/**
 * Calibration harness for the text checks: a corpus of realistic Sri Lankan
 * listings with the verdict each one SHOULD get, run against the live provider.
 *
 *   pnpm moderation:calibrate
 *   pnpm moderation:calibrate --only=tamil
 *
 * Re-run this after any change to prompts.ts or a PROMPT_VERSION bump. Roughly
 * 600 input tokens per case (~$0.0001), so a full run costs a fraction of a cent.
 *
 * Cases are chosen for the failure modes that actually cost money: a false
 * positive holds a legitimate landlord's listing, a false negative publishes
 * spam.
 */

import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

import { checkText } from '../lib/moderation/text-check';
import { isModerationConfigured } from '../lib/moderation/config';
import type { LocationInput } from '../lib/moderation/location';

interface Expect {
  languageSupported?: boolean;
  titleCoherent?: boolean;
  locationCoherent?: boolean;
  looksLikeRental?: boolean;
  /** Substring the detected language should start with, e.g. 'si'. */
  languagePrefix?: string;
  /** True when this case must be settled deterministically (zero tokens). */
  noModelCall?: boolean;
}

interface Case {
  name: string;
  tags: string[];
  listing: LocationInput;
  expect: Expect;
}

const CASES: Case[] = [
  {
    name: 'English listing, everything consistent',
    tags: ['english', 'happy'],
    listing: {
      title: '3BR House in Nugegoda',
      description:
        'Spacious three bedroom house for rent in Nugegoda. Two bathrooms, parking for one car, water tank and three-phase power. Rent Rs. 95,000 per month, deposit 2 months.',
      address: '12 Temple Road',
      city: 'Nugegoda',
      district: 'Colombo',
    },
    expect: { languageSupported: true, titleCoherent: true, locationCoherent: true, looksLikeRental: true },
  },
  {
    name: 'Sinhala-script listing with the English title we generate',
    tags: ['sinhala', 'cross-language'],
    listing: {
      title: '3BR House in Maharagama',
      description:
        'මහරගම ප්‍රදේශයේ කාමර 3ක නිවසක් කුලියට දෙනු ලැබේ. නාන කාමර 2, වාහන නවතන ස්ථානය සහ ජල ටැංකියක් ඇත. කුලිය මසකට රු. 65,000.',
      address: '34/1, පල්ලෙගම',
      city: 'Maharagama',
      district: 'Colombo',
    },
    expect: { languageSupported: true, titleCoherent: true, languagePrefix: 'si' },
  },
  {
    name: 'Tamil-script listing with an English title',
    tags: ['tamil', 'cross-language'],
    listing: {
      title: '2BR House in Jaffna',
      description:
        'யாழ்ப்பாணத்தில் 2 அறைகள் கொண்ட வீடு வாடகைக்கு. குளியலறை 1, வாகன நிறுத்தம் உள்ளது. மாத வாடகை ரூ. 45,000.',
      address: '18 Kasthuriar Road',
      city: 'Jaffna',
      district: 'Jaffna',
    },
    expect: { languageSupported: true, titleCoherent: true, languagePrefix: 'ta' },
  },
  {
    name: 'Romanized Sinhala (Singlish) — the dominant WhatsApp register',
    tags: ['singlish', 'cross-language'],
    listing: {
      title: '2BR House in Kadawatha',
      description:
        'Kadawatha gedara kuliyata denu labe. Kamara 2, nana kamara 1, vahana navatana sthanaya ethe. Kuliya masakata 55000. Kata karanna.',
      address: '45 Ganemulla Road',
      city: 'Kadawatha',
      district: 'Gampaha',
    },
    expect: { languageSupported: true, titleCoherent: true, looksLikeRental: true },
  },
  {
    name: 'Bilingual Sinhala + Tamil advert',
    tags: ['bilingual'],
    listing: {
      // නිවසක් / வீடு both mean "house", so the title must say House — an
      // earlier version of this fixture said Apartment and the check correctly
      // flagged it, which is why the title type is spelled out here.
      title: '2BR House in Colombo 6',
      description:
        'කුලියට නිවසක් / வாடகைக்கு வீடு — Wellawatte, කාමර 2, மாத வாடகை රු. 85,000.',
      address: '22 Station Road',
      city: 'Colombo 6',
      district: 'Colombo',
    },
    expect: { languageSupported: true, titleCoherent: true },
  },
  {
    name: 'Annex titled as Annex (our parser stores annex as a house)',
    tags: ['annex', 'false-positive-risk'],
    listing: {
      title: '1BR Annex in Kohuwala',
      description:
        'Self-contained annex with a separate entrance, one bedroom, own kitchen and bathroom. Rent 45,000 per month.',
      address: '8 Hospital Road',
      city: 'Kohuwala',
      district: 'Colombo',
    },
    expect: { titleCoherent: true, looksLikeRental: true },
  },
  {
    name: 'Room listing correctly titled as a Room',
    tags: ['room', 'false-positive-risk'],
    listing: {
      title: 'Room in Malabe',
      description:
        'Single room for rent near the campus, shared kitchen, attached bathroom. Rent 18,000 per month.',
      address: '14 New Kandy Road',
      city: 'Malabe',
      district: 'Colombo',
    },
    expect: { titleCoherent: true, looksLikeRental: true },
  },
  {
    name: 'Unknown small town must NOT be treated as inconsistent',
    tags: ['location', 'false-positive-risk'],
    listing: {
      title: '3BR House in Pallegama',
      description: 'Quiet three bedroom house with a garden, close to the main road. Rent 40,000 per month.',
      address: 'No 7, Pallegama',
      city: 'Pallegama',
      district: 'Matale',
    },
    expect: { locationCoherent: true, looksLikeRental: true, languageSupported: true },
  },
  {
    name: 'Town-named road is not a location contradiction',
    tags: ['location', 'false-positive-risk'],
    listing: {
      title: '2BR House in Nugegoda',
      description: 'Two bedroom house just off the main road, 10 minutes to the junction. Rent 70,000.',
      address: '120 Galle Road',
      city: 'Nugegoda',
      district: 'Colombo',
    },
    expect: { locationCoherent: true },
  },
  {
    name: 'City in the wrong district — deterministic hold, no tokens',
    tags: ['location', 'must-fail'],
    listing: {
      title: '3BR House in Nugegoda',
      description: 'Three bedroom house for rent. Rent 90,000 per month.',
      address: '5 Lake Road',
      city: 'Nugegoda',
      district: 'Kandy',
    },
    expect: { locationCoherent: false, noModelCall: true },
  },
  {
    name: 'Unsupported language (Hindi) — deterministic hold, no tokens',
    tags: ['language', 'must-fail'],
    listing: {
      title: 'House for rent',
      description: 'कोलंबो में किराए के लिए तीन कमरों का मकान उपलब्ध है। किराया 90,000 रुपये प्रति माह।',
      address: '10 Main Street',
      city: 'Colombo',
      district: 'Colombo',
    },
    expect: { languageSupported: false, noModelCall: true },
  },
  {
    name: 'Title contradicts description (3BR house vs a single room)',
    tags: ['coherence', 'must-fail'],
    listing: {
      title: '3BR House in Kandy',
      description:
        'Single room available for a working lady. Shared kitchen and bathroom with the owner family. Rent 12,000 per month.',
      address: '9 Peradeniya Road',
      city: 'Kandy',
      district: 'Kandy',
    },
    expect: { titleCoherent: false },
  },
  {
    name: 'Investment spam dressed as a listing',
    tags: ['spam', 'must-fail'],
    listing: {
      title: '2BR House in Colombo',
      description:
        'EARN 50,000 PER DAY FROM HOME! Guaranteed returns on your investment. Send USDT to start now. Limited slots. WhatsApp for details.',
      address: '1 Main Street',
      city: 'Colombo',
      district: 'Colombo',
    },
    expect: { looksLikeRental: false },
  },
  {
    name: 'Short but legitimate WhatsApp-style listing',
    tags: ['short', 'false-positive-risk'],
    listing: {
      title: '2BR House in Wattala',
      description: '2 bedroom house Wattala 65000 per month. Parking available.',
      address: '30 Negombo Road',
      city: 'Wattala',
      district: 'Gampaha',
    },
    expect: { looksLikeRental: true, titleCoherent: true, locationCoherent: true },
  },
];

function check(name: string, actual: unknown, expected: unknown): string | null {
  if (expected === undefined) return null;
  return actual === expected ? null : `${name}: expected ${expected}, got ${actual}`;
}

async function main() {
  if (!isModerationConfigured()) {
    console.error('No SILICONFLOW_API_KEY — nothing to calibrate against.');
    process.exit(1);
  }

  const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];
  const cases = only ? CASES.filter((c) => c.tags.includes(only) || c.name.toLowerCase().includes(only)) : CASES;

  console.log(`\nModeration text calibration — ${cases.length} case(s)\n`);
  let failed = 0;
  let tokensIn = 0;
  let tokensOut = 0;

  for (const c of cases) {
    const { verdict, usage, error } = await checkText(c.listing);
    tokensIn += usage.inputTokens;
    tokensOut += usage.outputTokens;

    const problems: string[] = [];
    if (error) problems.push(`provider error: ${error}`);
    problems.push(
      ...([
        check('languageSupported', verdict.languageSupported, c.expect.languageSupported),
        check('titleCoherent', verdict.titleCoherent, c.expect.titleCoherent),
        check('locationCoherent', verdict.locationCoherent, c.expect.locationCoherent),
        check('looksLikeRental', verdict.looksLikeRental, c.expect.looksLikeRental),
      ].filter(Boolean) as string[])
    );
    if (c.expect.languagePrefix && !verdict.language.startsWith(c.expect.languagePrefix)) {
      problems.push(`language: expected to start with "${c.expect.languagePrefix}", got "${verdict.language}"`);
    }
    if (c.expect.noModelCall && usage.inputTokens > 0) {
      problems.push(`expected NO model call, but spent ${usage.inputTokens} tokens`);
    }

    if (problems.length) {
      failed++;
      console.log(`✗ ${c.name}`);
      for (const p of problems) console.log(`    ${p}`);
      console.log(`    lang=${verdict.language} reasons=${JSON.stringify(verdict.reasons)}`);
    } else {
      const cost = usage.inputTokens === 0 ? 'free (rules)' : `${usage.inputTokens}t`;
      console.log(`✓ ${c.name}  [${verdict.language}, ${cost}]`);
    }
  }

  const usd = (tokensIn / 1e6) * 0.18 + (tokensOut / 1e6) * 0.68;
  console.log(`\ntokens: ${tokensIn} in / ${tokensOut} out  ≈ $${usd.toFixed(5)}`);
  console.log(failed ? `${failed} of ${cases.length} case(s) FAILED\n` : `All ${cases.length} cases passed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('calibration crashed:', err);
  process.exit(1);
});
