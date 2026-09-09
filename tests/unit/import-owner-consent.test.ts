import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONSENT_TEMPLATE_PARAM_COUNT,
  CONSENT_TEMPLATE_TEXT,
  consentTemplateParams,
  renderConsentText,
} from '@/lib/imports/message';
import { assertImportConsent, ImportConsentError } from '@/lib/imports/consent';
import { sanitizeTemplateParam } from '@/lib/intake/channels/whatsapp/send';

/**
 * The importer is opt-in (migration 0060). Nothing about someone's property
 * becomes public until they say yes over WhatsApp.
 *
 * The failure these guard against is not a wrong value, it is a MISSING CHECK —
 * the same shape as the bug that preceded this feature, where the owner notice
 * was wired into two of four publish paths and nobody was told anything. So
 * several of these read source and assert where a call sits, which is exactly
 * what a mocked unit test would paper over.
 */
function code(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('the consent gate', () => {
  it('throws when the owner has not agreed', () => {
    expect(() => assertImportConsent({ consentGrantedAt: null })).toThrow(ImportConsentError);
  });

  it('passes once they have', () => {
    expect(() => assertImportConsent({ consentGrantedAt: new Date() })).not.toThrow();
  });

  it('throws rather than returning false, so an ignored result cannot publish', () => {
    const consent = code('lib/imports/consent.ts');
    const fn = consent.slice(consent.indexOf('export function assertImportConsent'));
    expect(fn).toContain('throw new ImportConsentError');
    // A boolean return would let a caller publish by forgetting to read it.
    expect(fn.slice(0, fn.indexOf('}'))).not.toMatch(/return\s+(true|false)/);
  });

  it('is checked BEFORE the listing row is inserted, not after', () => {
    const publish = code('lib/imports/publish.ts');
    const gate = publish.indexOf('assertImportConsent(record)');
    const insert = publish.indexOf('.insert(listings)');
    expect(gate).toBeGreaterThanOrEqual(0);
    expect(insert).toBeGreaterThan(gate);
  });

  it('lives in publishImport, the single function that creates the listing', () => {
    // One chokepoint. A permission check spread across the calling screens
    // fails the way the owner notice did, except the failure publishes a
    // stranger's property instead of staying quiet about it.
    const publish = code('lib/imports/publish.ts');
    expect(publish.match(/assertImportConsent\(/g) ?? []).toHaveLength(1);
    expect(publish.match(/\.insert\(listings\)/g) ?? []).toHaveLength(1);
  });

  it('the operator screen asks rather than publishes', () => {
    const actions = code('app/(dashboard)/back-office/imports/actions.ts');
    expect(actions).toContain('requestImportConsent');
    expect(actions).not.toContain('await publishImport(');
  });

  it('refuses to ask the same owner twice', () => {
    const actions = code('app/(dashboard)/back-office/imports/actions.ts');
    expect(actions).toContain('saved.consentRequestedAt');
    expect(actions).toContain('already_asked');
  });
});

describe('the consent template contract', () => {
  const input = {
    ownerName: 'Nimal Perera',
    listingTitle: '3BR House in Nugegoda',
    ownerPhone: '+94771234567',
  };

  it('declares exactly the variables the body uses', () => {
    const used = new Set(CONSENT_TEMPLATE_TEXT.match(/\{\{\d+\}\}/g) ?? []);
    expect(used.size).toBe(CONSENT_TEMPLATE_PARAM_COUNT);
    for (let i = 1; i <= CONSENT_TEMPLATE_PARAM_COUNT; i++) {
      expect(CONSENT_TEMPLATE_TEXT).toContain(`{{${i}}}`);
    }
  });

  it('produces exactly that many parameters', () => {
    expect(consentTemplateParams(input)).toHaveLength(CONSENT_TEMPLATE_PARAM_COUNT);
  });

  it('never emits an empty parameter, whatever is missing', () => {
    // Meta rejects the entire send if a declared variable resolves to ''.
    const bare = consentTemplateParams({ ownerName: null, listingTitle: '', ownerPhone: ' x ' });
    for (const value of bare) expect(value.trim()).not.toBe('');
  });

  it('survives a hostile advert title once sanitised', () => {
    /*
     * Meta rejects a body parameter containing a newline, a tab, or 5+
     * consecutive spaces. Sanitising is the SENDER's job — sendWhatsAppTemplate
     * runs every param through sanitizeTemplateParam — so this asserts the same
     * layer the notice's own test does, and a title pasted out of a Facebook
     * advert is exactly the hostile input that reaches it.
     */
    const hostile = consentTemplateParams({
      ownerName: 'Nimal\n\tPerera',
      listingTitle: '3BR   House\n\nin     Nugegoda',
      ownerPhone: '+94771234567',
    });
    for (const value of hostile.map(sanitizeTemplateParam)) {
      expect(value).not.toMatch(/[\n\t]|\s{5,}/);
    }
  });

  it('does not duplicate the town the title already carries', () => {
    // The notice rendered "{{2}} in {{3}}" and composeTitle() writes the town
    // into the title, so a real send read "3BR House in Nugegoda in Nugegoda".
    const rendered = renderConsentText(consentTemplateParams(input), 'https://easyrent.lk/l/t0k');
    expect(rendered).not.toMatch(/Nugegoda\s+in\s+Nugegoda/);
  });

  it('says the four things that make one reply real consent', () => {
    const text = CONSENT_TEMPLATE_TEXT.toLowerCase();
    // Nothing published yet — otherwise it is a notice, not an ask.
    expect(text).toMatch(/nothing is published/);
    // Names the social platforms, or a single yes covers something unpictured.
    expect(text).toMatch(/facebook, instagram and tiktok/);
    // Silence is a no, stated.
    expect(text).toMatch(/if you do not reply/);
    // Free, which is the platform's public positioning.
    expect(text).toMatch(/free of charge|completely free/);
  });
});

describe('answering the question', () => {
  const session = code('lib/intake/session.ts');

  it('treats confirm_import as a fall-through state, like confirm_social', () => {
    // Neither may hold the thread hostage: both questions are unsolicited, so
    // swallowing DELETE or HELP for the life of the prompt would be worse.
    const block = session.slice(
      session.indexOf("convo.state === 'confirm_import'"),
      session.indexOf("convo.state === 'confirm_city'")
    );
    expect(block).toContain('clearConversation');
    expect(block).toContain('isAffirmative');
    expect(block).toContain('isCancel');
  });

  it('requires an unambiguous yes — nothing is inferred', () => {
    const block = session.slice(
      session.indexOf("convo.state === 'confirm_import'"),
      session.indexOf("convo.state === 'confirm_city'")
    );
    expect(block).toContain('const yes = isAffirmative(msg.text)');
  });

  it('publishes only from the granted branch', () => {
    const webhook = code('app/api/whatsapp/webhook/route.ts');
    const granted = webhook.indexOf("outcome.action === 'import_consent_granted'");
    const declined = webhook.indexOf("outcome.action === 'import_consent_declined'");
    expect(granted).toBeGreaterThanOrEqual(0);
    expect(webhook.slice(granted, declined)).toContain('publishImport');
    expect(webhook.slice(declined)).not.toContain('publishImport');
  });

  it('actually deletes what a NO promised would be deleted', () => {
    const consent = code('lib/imports/consent.ts');
    const decline = consent.slice(consent.indexOf('export async function declineImportConsent'));
    for (const field of ['rawText: null', 'parsedPayload: null', 'photoUrls: null']) {
      expect(decline).toContain(field);
    }
  });

  it('records consent as whatsapp, because the owner really was asked', () => {
    const publish = code('lib/imports/publish.ts');
    expect(publish).toContain("socialConsentSource: 'whatsapp'");
    expect(publish).not.toContain("socialConsentSource: 'ops'");
  });
});

describe('the preview link', () => {
  const route = code('app/l/[...slug]/route.ts');

  it('resolves consent tokens BEFORE the access-link path', () => {
    const consent = route.indexOf('resolveConsentToken(token)');
    const access = route.indexOf('resolveAccessToken(token)');
    expect(consent).toBeGreaterThanOrEqual(0);
    expect(consent).toBeLessThan(access);
  });

  it('mints no session for someone who has not agreed to anything', () => {
    const branch = route.slice(
      route.indexOf('resolveConsentToken(token)'),
      route.indexOf('resolveAccessToken(token)')
    );
    expect(branch).not.toContain('verifyOtp');
    expect(branch).not.toContain('generateLink');
    expect(branch).toContain('/preview/');
  });

  it('renders from post_imports, never from the listings table', () => {
    const page = code('app/preview/[token]/page.tsx');
    expect(page).toContain('resolveConsentToken');
    // A listing row does not exist yet, and must not be created to show a
    // preview — nothing in the table the marketplace reads from.
    expect(page).not.toMatch(/from\s+['"]@\/lib\/db\/schema['"]/);
    expect(page).toContain('index: false');
  });

  it('stops resolving once the question is answered', () => {
    const consent = code('lib/imports/consent.ts');
    const resolver = consent.slice(consent.indexOf('export async function resolveConsentToken'));
    expect(resolver).toContain('isNull(postImports.consentGrantedAt)');
    expect(resolver).toContain('isNull(postImports.consentDeclinedAt)');
  });

  it('stores only the hash, never the token', () => {
    const consent = code('lib/imports/consent.ts');
    expect(consent).toContain('consentTokenHash: hashConsentToken(token)');
    expect(consent).not.toMatch(/consentToken:\s*token/);
  });
});

describe('migration 0060', () => {
  const sql = readFileSync(
    join(process.cwd(), 'lib/db/migrations/0060_import_owner_consent.sql'),
    'utf-8'
  );

  it('is registered with the runner, or it would never execute', () => {
    const runner = readFileSync(join(process.cwd(), 'lib/db/run-all-migrations.ts'), 'utf-8');
    expect(runner).toContain("'0060_import_owner_consent.sql'");
  });

  it('contains no DO block, which the statement splitter mis-parses', () => {
    expect(sql).not.toMatch(/DO \$\$/);
  });

  it('is safe to replay forever', () => {
    for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
      if (!/^(ALTER|CREATE)/i.test(stmt)) continue;
      expect(stmt).toMatch(/IF NOT EXISTS/i);
    }
    expect(sql).not.toMatch(/\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
  });

  it('does not backfill consent onto listings published before it existed', () => {
    // Recording "they agreed" for someone who was never asked is the one thing
    // this column must never say.
    expect(sql).not.toMatch(/UPDATE\s+post_imports/i);
  });
});
