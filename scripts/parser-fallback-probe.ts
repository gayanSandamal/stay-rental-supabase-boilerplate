/**
 * Validate the intake parser's LLM fallback against the live SiliconFlow API,
 * without touching the database.
 *
 *   SILICONFLOW_API_KEY=sk-... npx tsx scripts/parser-fallback-probe.ts
 *
 * Checks, in order:
 *   1. the endpoint + key work with the configured model id (a wrong id is an
 *      error, not a silent pass)
 *   2. the model recovers a city the rule parser GENUINELY missed and returns
 *      it as parseable JSON
 *
 * The probe town must be absent from the gazetteer: the prompt tells the model
 * to extract only fields the rules could not find, and asking it to "recover"
 * a city the rules already resolved is a self-contradiction it (correctly)
 * answers with null — measured 0/3 on a known town vs 2/2 on an unknown one.
 * Production never produces that ask; the probe must not either. If a future
 * gazetteer sweep adds the probe town, this exits with instructions instead of
 * a misleading failure.
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

// Pallegama (Matale) is deliberately NOT in the gazetteer — the moderation
// unit tests pin it as the canonical unknown town.
const PROBE_TOWN = 'Pallegama';
const MESSAGE = `House for rent in ${PROBE_TOWN}, 5 bedrooms, 3 bathrooms, parking`;
const FALLBACK_MODEL = 'Qwen/Qwen2.5-7B-Instruct';

/** One retry: the live endpoint shows occasional cold-path 8s timeouts. */
async function callWithRetry(message: string, missing: string[]) {
  const first = await parseIntakeWithLlm(message, missing);
  if (first) return first;
  console.log('  (empty/failed response — retrying once)');
  return parseIntakeWithLlm(message, missing);
}

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

  console.log('Rule parser (must leave a city gap for the LLM):');
  const rule = parseIntakeRules(MESSAGE);
  console.log(
    `  city: ${JSON.stringify(rule.city)} | bedrooms: ${rule.bedrooms} | missing: [${rule.missingFields.join(', ')}]`
  );

  if (!rule.missingFields.includes('city')) {
    bad(
      `the gazetteer now resolves "${PROBE_TOWN}" — the probe no longer tests anything. ` +
        `Change PROBE_TOWN to a real town matchCity() does not know.`
    );
    console.log('\n1 problem(s) found.\n');
    process.exit(1);
  }

  console.log('\nLLM fallback (asked for exactly the fields the rules missed):');
  let llm = await callWithRetry(MESSAGE, rule.missingFields);
  if (!llm && !process.env.INTAKE_LLM_MODEL) {
    // A dead default model id should not end the probe without an answer.
    bad(`${model} returned nothing — retrying with ${FALLBACK_MODEL}`);
    process.env.INTAKE_LLM_MODEL = FALLBACK_MODEL;
    llm = await callWithRetry(MESSAGE, rule.missingFields);
    if (llm) console.log(`  → ${FALLBACK_MODEL} works; adopt it as the code default.`);
  }

  if (!llm) {
    bad('fallback returned null — check the model id and key (errors logged above)');
    failures++;
  } else {
    ok(`parsed: ${JSON.stringify({ city: llm.city, address: llm.address })}`);
    if ((llm.city ?? '').toLowerCase() === PROBE_TOWN.toLowerCase()) {
      ok(`recovered city "${PROBE_TOWN}" — the field the rules missed`);
    } else {
      bad(`city came back as ${JSON.stringify(llm.city)} — expected "${PROBE_TOWN}"`);
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
