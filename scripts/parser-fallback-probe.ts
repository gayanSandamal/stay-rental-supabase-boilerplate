/**
 * Validate the intake parser's LLM fallback against the live SiliconFlow API,
 * without touching the database.
 *
 *   SILICONFLOW_API_KEY=sk-... npx tsx scripts/parser-fallback-probe.ts
 *
 * Checks, in order:
 *   1. the endpoint + key work with the configured model id (a wrong id is an
 *      error, not a silent pass)
 *   2. the model recovers a city the rule parser missed ("Kolonnawa" is the
 *      canonical unknown-town case) and returns it as parseable JSON
 *
 * Run this before flipping enableLlmParserFallback on.
 */

import dotenv from 'dotenv';
// .env ONLY — .env.local carries a DATABASE_URL for a different local stack
// and must never leak into a hand-run script.
dotenv.config({ path: '.env' });

import { parseIntakeRules } from '../lib/intake/parser/rule-parser';
import { parseIntakeWithLlm } from '../lib/intake/parser/llm-parser';
import { MODERATION_API_BASE, moderationApiKey } from '../lib/moderation/config';

const ok = (s: string) => console.log(`  ✓ ${s}`);
const bad = (s: string) => console.log(`  ✗ ${s}`);

const MESSAGE = 'House for rent in Kolonnawa, 5 bedrooms, 3 bathrooms, parking';
const FALLBACK_MODEL = 'Qwen/Qwen2.5-7B-Instruct';

async function main() {
  const model = process.env.INTAKE_LLM_MODEL || 'Qwen/Qwen3-8B';
  console.log('\nParser LLM fallback probe');
  console.log(`  endpoint: ${MODERATION_API_BASE}`);
  console.log(`  model:    ${model}\n`);

  if (!moderationApiKey()) {
    bad('No SILICONFLOW_API_KEY (or MODERATION_API_KEY) in the environment.');
    process.exit(1);
  }

  let failures = 0;

  console.log('Rule parser (should leave gaps for the LLM):');
  const rule = parseIntakeRules(MESSAGE);
  console.log(
    `  city: ${JSON.stringify(rule.city)} | bedrooms: ${rule.bedrooms} | missing: [${rule.missingFields.join(', ')}]`
  );

  // The probe exists to prove city recovery, so ask for it even if a future
  // gazetteer sweep teaches the rules "Kolonnawa".
  const missing = rule.missingFields.includes('city')
    ? rule.missingFields
    : ['city', ...rule.missingFields];

  console.log('\nLLM fallback:');
  let llm = await parseIntakeWithLlm(MESSAGE, missing);
  if (!llm && !process.env.INTAKE_LLM_MODEL) {
    // A dead default model id should not end the probe without an answer.
    bad(`${model} returned nothing — retrying with ${FALLBACK_MODEL}`);
    process.env.INTAKE_LLM_MODEL = FALLBACK_MODEL;
    llm = await parseIntakeWithLlm(MESSAGE, missing);
    if (llm) console.log(`  → ${FALLBACK_MODEL} works; adopt it as the code default.`);
  }

  if (!llm) {
    bad('fallback returned null — check the model id and key (errors logged above)');
    failures++;
  } else {
    ok(`parsed: ${JSON.stringify({ city: llm.city, bedrooms: llm.bedrooms, bathrooms: llm.bathrooms })}`);
    if ((llm.city ?? '').toLowerCase() === 'kolonnawa') {
      ok('recovered city "Kolonnawa" — the field the rules missed');
    } else {
      bad(`city came back as ${JSON.stringify(llm.city)} — expected "Kolonnawa"`);
      failures++;
    }
  }

  console.log(failures ? `\n${failures} problem(s) found.\n` : '\nAll probes passed.\n');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error('probe crashed:', err);
  process.exit(1);
});
