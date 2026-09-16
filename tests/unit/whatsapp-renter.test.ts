import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  intentUnclearButtons,
  intentUnclearMessage,
  renterWelcomeMessage,
} from '@/lib/intake/messages';

/**
 * The renter branch: a WhatsApp sender who says they are looking for a place
 * gets a tenant account and a sign-in link, instead of "browse the website".
 *
 * Copy assertions run against the real builders. Wiring assertions are source
 * scans, for the same reason `intake-search-guard.test.ts` uses them: the
 * property is "this call sits behind that flag, with that fallback", which a
 * mocked pipeline would satisfy while the real order was wrong.
 */
function code(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8');
}

const SINHALA = /[඀-෿]/;
const TAMIL = /[஀-௿]/;
const cp = (s: string) => [...s].length;

describe('the question is asked in all three languages', () => {
  const msg = intentUnclearMessage();

  it('carries Sinhala, Tamil and English in one message', () => {
    expect(SINHALA.test(msg)).toBe(true);
    expect(TAMIL.test(msg)).toBe(true);
    expect(msg).toContain('Are you looking for a property to rent');
  });

  it('offers both options in every language, numbered so any reply works', () => {
    expect(msg).toContain('1️⃣');
    expect(msg).toContain('2️⃣');
    // The operative tokens the confirm_intent handler matches on.
    expect(msg).toMatch(/Reply 1 or 2/);
  });

  it('separates languages with · and never /', () => {
    /*
     * newListingTemplateMessage documents why: `/` collides with real
     * addresses like "45/2". This copy is not parser input today, but an
     * unrecognised reply to it falls through and IS parsed.
     */
    const optionLines = msg.split('\n').filter((l) => l.startsWith('1️⃣') || l.startsWith('2️⃣'));
    expect(optionLines).toHaveLength(2);
    for (const line of optionLines) {
      expect(line).toContain('·');
      expect(line).not.toContain('/');
    }
  });

  it('fits inside the Cloud API interactive body limit', () => {
    expect(msg.length).toBeLessThanOrEqual(1024);
  });
});

describe('the buttons fit what WhatsApp will actually render', () => {
  const buttons = intentUnclearButtons();

  it('sends at most 3 replies with titles under the 20 code-point cap', () => {
    // clip() truncates BY CODE POINT, so a title over the cap is silently cut
    // mid-label rather than rejected — nothing would fail loudly in production.
    expect(buttons.length).toBeLessThanOrEqual(3);
    for (const b of buttons) {
      expect(cp(b.title), `${b.title} = ${cp(b.title)} code points`).toBeLessThanOrEqual(20);
    }
  });

  it('keeps the ids the session state machine branches on', () => {
    expect(buttons.map((b) => b.id)).toEqual(['intent_listing', 'intent_search']);
  });

  it('keeps titles free of Sinhala and Tamil, since only one could ever fit', () => {
    // Picking one native language for the buttons is worse than picking none —
    // the three languages live in the body instead.
    for (const b of buttons) {
      expect(SINHALA.test(b.title), b.title).toBe(false);
      expect(TAMIL.test(b.title), b.title).toBe(false);
    }
  });
});

describe('the welcome message is useful and does not overpromise', () => {
  const url = 'https://easyrent.lk/l/tok3n/r';
  const msg = renterWelcomeMessage('Nimal', url);

  it('carries the sign-in link and the name they gave WhatsApp', () => {
    expect(msg).toContain(url);
    expect(msg).toContain('Nimal');
  });

  it('works when WhatsApp gave us no profile name', () => {
    const anon = renterWelcomeMessage(null, url);
    expect(anon).toContain(url);
    expect(anon).not.toContain('undefined');
    expect(anon).not.toContain('null');
    expect(anon).toMatch(/This link signs you in/);
  });

  it('NEVER promises alerts', () => {
    /*
     * Saved-search alerts are delivered by email, and a WhatsApp account's
     * address is on wa.easyrent.lk — a domain chosen for having no MX record.
     * A renter promised alerts would simply never hear from us again.
     */
    expect(msg).not.toMatch(/alert|notify|notification|we'?ll let you know|email you/i);
  });

  it('warns that the link is a bearer credential', () => {
    expect(msg).toMatch(/private/i);
  });
});

describe('the search branch registers instead of dead-ending', () => {
  const webhook = code('app/api/whatsapp/webhook/route.ts');
  const branch = webhook.slice(
    webhook.indexOf("outcome.action === 'search'"),
    webhook.indexOf("outcome.action === 'intent_unclear'")
  );

  it('is gated on its own flag, not the landlord-account one', () => {
    expect(branch).toContain("isFeatureEnabled('enableWhatsAppRenterAccounts')");
    expect(branch).not.toContain('enableWhatsAppLandlordAccounts');
  });

  it('falls back to the old reply when the flag is off or registration fails', () => {
    // One fallback covering both, so a renter is never met with silence.
    expect(branch).toContain('searchNotAvailableMessage');
    expect(branch).toContain('if (!welcomed)');
  });

  it('registers a RENTER, never a landlord', () => {
    expect(webhook).toContain('getOrCreateWhatsAppRenter');
    expect(webhook).not.toContain('getOrCreateWhatsAppLandlord');
  });

  it('sends the renter to /listings, not the landlord listing manager', () => {
    expect(webhook).toContain('links.renterUrl');
    expect(code('app/l/[...slug]/route.ts')).toContain("action === 'r') destination = '/listings'");
  });
});

describe('the intent question does not depend on the rich-replies flag', () => {
  const webhook = code('app/api/whatsapp/webhook/route.ts');
  const branch = webhook.slice(
    webhook.indexOf("outcome.action === 'intent_unclear'"),
    webhook.indexOf("outcome.action === 'help'")
  );

  it('sends buttons unconditionally', () => {
    expect(branch).toContain('await sendWhatsAppButtons(');
    expect(branch).not.toMatch(/rich\s*&&/);
  });

  it('still keeps the plain-text path for a client that cannot render them', () => {
    expect(branch).toContain('intentUnclearMessage');
    expect(branch).toContain('if (!asked)');
  });
});

describe('a button tap cannot rewrite the sender language', () => {
  const webhook = code('app/api/whatsapp/webhook/route.ts');

  it('skips detection when the message is an interactive reply', () => {
    /*
     * The adapter sets `text = reply.title` for a tap — our own copy. langFor
     * PERSISTS what it detects to users.preferred_language, so without this
     * guard one tap on a natively-titled row (the delete menu sends listing
     * titles) would switch that sender's language for good.
     */
    expect(webhook).toContain('message.interactiveReplyId ? null : message.text');
  });
});

describe('a renter who later lists is promoted, and nobody is demoted', () => {
  const identity = code('lib/intake/landlord-identity.ts');

  it('promotes only a tenant, so ops and admin survive the landlord path', () => {
    expect(identity).toContain("args.asLandlord && existing.role === 'tenant'");
  });

  it('never gives a renter a landlords row', () => {
    // ensureLandlordRow is reachable only from the landlord entry point.
    const renterFn = identity.slice(
      identity.indexOf('export async function getOrCreateWhatsAppRenter'),
      identity.indexOf('async function getOrCreateWhatsAppAccount')
    );
    expect(renterFn).not.toContain('ensureLandlordRow');
  });

  it('leaves role out of the SET for a renter rather than writing tenant back', () => {
    expect(identity).toContain("...(args.asLandlord ? { role: 'landlord' as const } : {})");
  });
});
