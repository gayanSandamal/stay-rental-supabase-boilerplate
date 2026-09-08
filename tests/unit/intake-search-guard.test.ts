import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards on the WIRING, not the classifier — `intake-intent.test.ts` covers the
 * decision. What matters here is that the decision is consulted before anything
 * writes, and that a search returns without creating a row.
 *
 * Source scans rather than a mocked pipeline: the property is "this call sits
 * before that write", which a mock would happily satisfy while the real order
 * was wrong.
 */
function code(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('a search can never become a listing', () => {
  const session = code('lib/intake/session.ts');

  it('classifies before the open-session append', () => {
    const classify = session.indexOf('classifyIntent(');
    const append = session.indexOf('const open = recent.find(');
    expect(classify).toBeGreaterThanOrEqual(0);
    expect(append).toBeGreaterThan(classify);
  });

  it('classifies before the whatsapp_intakes insert that creates a listing', () => {
    const classify = session.indexOf('classifyIntent(');
    // The final fallthrough insert — the one that produced the fake listings.
    const insert = session.lastIndexOf('.insert(whatsappIntakes)');
    expect(insert).toBeGreaterThan(classify);
  });

  it('returns the search outcome without touching whatsapp_intakes', () => {
    const branch = session.slice(
      session.indexOf('classifyIntent('),
      session.indexOf('const open = recent.find(')
    );
    expect(branch).toContain("action: 'search'");
    expect(branch).not.toContain('.insert(whatsappIntakes)');
  });

  it('passes hasOpenIntake, so a landlord mid-submission is never reinterpreted', () => {
    expect(session).toContain('hasOpenIntake');
    const classify = session.indexOf('classifyIntent(');
    const computed = session.indexOf('const hasOpenIntake');
    expect(computed).toBeGreaterThanOrEqual(0);
    expect(classify).toBeGreaterThan(computed);
  });

  it('skips classification for a location pin, which is never a search', () => {
    expect(session).toContain('if (msg.text && !msg.location)');
  });
});

describe('the ambiguous path asks instead of guessing', () => {
  const session = code('lib/intake/session.ts');
  const webhook = code('app/api/whatsapp/webhook/route.ts');

  it('parks the original text so the answer costs a tap, not a retype', () => {
    expect(session).toContain('intentText: msg.text');
  });

  it('resumes the submission with the parked text when they say "listing"', () => {
    expect(session).toContain('messageText: parked || msg.text');
  });

  it('falls through on an unrecognised reply, so DELETE and HELP still work', () => {
    // Same rule as confirm_social: a pending question must not swallow commands.
    const block = session.slice(
      session.indexOf("convo.state === 'confirm_intent'"),
      session.indexOf("convo.state === 'confirm_social'")
    );
    expect(block).toContain('clearConversation');
  });

  it('the webhook always has a plain-text path, since rich replies default off', () => {
    const branch = webhook.slice(
      webhook.indexOf("outcome.action === 'intent_unclear'"),
      webhook.indexOf("outcome.action === 'help'")
    );
    expect(branch).toContain('intentUnclearMessage');
    expect(branch).toContain('if (!asked)');
  });
});
