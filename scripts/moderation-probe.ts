/**
 * Validate the moderation provider end to end, without touching the database.
 *
 *   SILICONFLOW_API_KEY=sk-... npx tsx scripts/moderation-probe.ts
 *   SILICONFLOW_API_KEY=sk-... npx tsx scripts/moderation-probe.ts ./photo.jpg
 *
 * Checks, in order:
 *   1. the endpoint + key work at all
 *   2. the configured model ids exist (a wrong id is a 400, not a silent pass)
 *   3. the text check returns parseable JSON on a Sinhala listing
 *   4. the image gate returns parseable JSON (+ bbox grounding) on a real photo
 *
 * Run this before flipping enableListingModeration on.
 */

import dotenv from 'dotenv';
// Load before importing anything that reads process.env at module scope.
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { chatJson } from '../lib/moderation/client';
import {
  MODERATION_ADJUDICATE_MODEL,
  MODERATION_API_BASE,
  MODERATION_IMAGE_MODEL,
  MODERATION_TEXT_MODEL,
  isModerationConfigured,
} from '../lib/moderation/config';
import { IMAGE_GATE_SYSTEM, TEXT_CHECK_SYSTEM, buildTextCheckUser } from '../lib/moderation/prompts';
import { checkLocationCoherence } from '../lib/moderation/location';
import { analyzeScript } from '../lib/moderation/language';

const ok = (s: string) => console.log(`  ✓ ${s}`);
const bad = (s: string) => console.log(`  ✗ ${s}`);

async function sampleImage(argPath?: string): Promise<Buffer> {
  if (argPath) return readFile(argPath);
  // A synthetic "room" with a fake agency watermark, so the overlay-text check
  // has something real to find.
  const svg = Buffer.from(
    `<svg width="900" height="600" xmlns="http://www.w3.org/2000/svg">
       <rect width="900" height="600" fill="#cfc7ba"/>
       <rect x="60" y="380" width="320" height="150" fill="#8a7f6d"/>
       <rect x="600" y="120" width="240" height="200" fill="#e8e2d5"/>
       <text x="450" y="300" font-family="sans-serif" font-size="52" fill="#ffffff"
             opacity="0.65" text-anchor="middle">ABC Realty .lk</text>
     </svg>`
  );
  return sharp(svg).jpeg({ quality: 90 }).toBuffer();
}

async function main() {
  console.log('\nModeration provider probe');
  console.log(`  endpoint: ${MODERATION_API_BASE}`);
  console.log(`  image model:      ${MODERATION_IMAGE_MODEL}`);
  console.log(`  adjudicate model: ${MODERATION_ADJUDICATE_MODEL}`);
  console.log(`  text model:       ${MODERATION_TEXT_MODEL}\n`);

  if (!isModerationConfigured()) {
    bad('No SILICONFLOW_API_KEY (or MODERATION_API_KEY) in the environment.');
    process.exit(1);
  }

  let failures = 0;

  // --- 1 + 3: text check on a Sinhala listing ------------------------------
  console.log('Text check (Sinhala listing, English title):');
  const listing = {
    title: '3BR House in Maharagama',
    description: 'මහරගම ප්‍රදේශයේ කාමර 3ක නිවසක් කුලියට. කුලිය මසකට රු. 65,000. වාහන නවතන ස්ථානය ඇත.',
    address: '34/1, පල්ලෙගම',
    city: 'Maharagama',
    district: 'Colombo',
  };
  console.log(`  script detected: ${analyzeScript(`${listing.title}\n${listing.description}`).verdict}`);
  const loc = checkLocationCoherence(listing);
  const text = await chatJson<Record<string, unknown>>({
    model: MODERATION_TEXT_MODEL,
    system: TEXT_CHECK_SYSTEM,
    user: buildTextCheckUser({ ...listing, notes: loc.softNotes }),
    maxTokens: 500,
  });
  if (text.error) {
    bad(`text call failed: ${text.error}`);
    failures++;
  } else {
    ok(`parsed: ${JSON.stringify(text.data)}`);
    const d = text.data as any;
    if (d?.title_matches_description === false) {
      bad('MISMATCH FLAGGED on a valid cross-language listing — the prompt needs work');
      failures++;
    } else {
      ok('cross-language title accepted (the key false-positive risk)');
    }
    console.log(`  tokens: ${text.usage.inputTokens} in / ${text.usage.outputTokens} out`);
  }

  // --- 2 + 4: image gate ---------------------------------------------------
  console.log('\nImage gate:');
  const bytes = await sampleImage(process.argv[2]);
  const prepared = await sharp(bytes)
    .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  const image = await chatJson<Record<string, unknown>>({
    model: MODERATION_IMAGE_MODEL,
    system: IMAGE_GATE_SYSTEM,
    user: 'Inspect this photo and return the JSON object.',
    images: [{ buffer: prepared, mimeType: 'image/jpeg' }],
    maxTokens: 400,
  });
  if (image.error) {
    bad(`image call failed: ${image.error}`);
    failures++;
  } else {
    ok(`parsed: ${JSON.stringify(image.data)}`);
    const d = image.data as any;
    if (!process.argv[2]) {
      // The synthetic sample carries a fake agency watermark.
      if (d?.overlay_text === true) ok('detected the added watermark on the sample');
      else bad('did NOT detect the added watermark — tune IMAGE_GATE_SYSTEM before enabling');
    }
    if (Array.isArray(d?.faces)) ok(`bbox grounding present (faces: ${d.faces.length})`);
    console.log(`  tokens: ${image.usage.inputTokens} in / ${image.usage.outputTokens} out`);
    const perListing = ((image.usage.inputTokens * 6 + text.usage.inputTokens) / 1e6) * 0.18;
    console.log(`  est. cost for a 6-photo listing: ~$${perListing.toFixed(4)}`);
  }

  console.log(failures ? `\n${failures} problem(s) found.\n` : '\nAll probes passed.\n');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error('probe crashed:', err);
  process.exit(1);
});
