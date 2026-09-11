import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  VERIFIED_LISTING_LABEL,
  VERIFIED_LANDLORD_LABEL,
  WHATSAPP_VERIFIED_LABEL,
  VERIFIED_NUMBER_LABEL,
} from '@/components/verification-badges';

const ALL_LABELS = [
  VERIFIED_LISTING_LABEL,
  VERIFIED_LANDLORD_LABEL,
  WHATSAPP_VERIFIED_LABEL,
  VERIFIED_NUMBER_LABEL,
];

/**
 * Three different things on this site can be "verified" and a renter deciding
 * whether to hand over a deposit has to be able to tell which claim is being
 * made. Every test here defends one rule: A BADGE SAYS EXACTLY WHAT WAS
 * CHECKED — never the bare word, never a stronger claim than the data carries.
 */

function code(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('badge labels', () => {
  it('are all distinct', () => {
    expect(new Set(ALL_LABELS).size).toBe(ALL_LABELS.length);
  });

  it('never render the bare word "Verified"', () => {
    // The collision this file exists to prevent: a property badge, an identity
    // badge and a phone-number badge that look identical on the same page.
    for (const label of ALL_LABELS) {
      expect(label.trim().toLowerCase()).not.toBe('verified');
    }
  });

  it('keep the WhatsApp badge from reading as an identity check', () => {
    expect(WHATSAPP_VERIFIED_LABEL.toLowerCase()).toContain('whatsapp');
    expect(WHATSAPP_VERIFIED_LABEL.toLowerCase()).not.toContain('landlord');
  });

  it('are used by the rendering surfaces instead of a hardcoded string', () => {
    const card = code('components/listing-card.tsx');
    expect(card).toContain('VERIFIED_LISTING_LABEL');

    const detail = code('app/(dashboard)/listings/[id]/page.tsx');
    expect(detail).toContain('VERIFIED_NUMBER_LABEL');

    // A re-hardcoded "> Verified <" on either surface would silently
    // reintroduce the collision the labels exist to remove.
    for (const [name, source] of [['card', card], ['detail', detail]] as const) {
      expect(source, name).not.toMatch(/>\s*Verified\s*</);
    }
  });

  it('names the owner beside the contact number, not just the digits', () => {
    // The contact block is where a visitor decides to call a stranger about a
    // deposit; the number alone does not say who answers.
    const detail = code('app/(dashboard)/listings/[id]/page.tsx');
    const contactBlock = detail.slice(detail.indexOf('Contact {publisherType'));
    expect(contactBlock).toContain('{publisherName}');
  });
});

describe('publisher verification data', () => {
  const source = code('lib/listings/publisher-info.ts');

  it('derives WhatsApp verification from the PROVEN-AT timestamp, not wa_phone', () => {
    // wa_phone alone is not proof since the Facebook importer writes numbers an
    // owner typed into their own advert (migration 0057).
    expect(source).toContain('waPhoneVerifiedAt');
    expect(source).toContain('waPhoneVerifiedAt !== null');
  });

  it('never claims landlord verification on the business path', () => {
    // The displayed name there belongs to the business account, so a landlord
    // badge would be attached to the wrong subject.
    const businessBlock = source.slice(
      source.indexOf("publisherType: 'business'"),
      source.indexOf('continue;')
    );
    expect(businessBlock).toContain('kycVerified: false');
    expect(businessBlock).toContain('whatsappVerified: false');
  });

  it('defaults an unresolved publisher to unverified at every call site', () => {
    const callSites = [
      'app/api/listings/paginated/route.ts',
      'app/(dashboard)/listings/listings-results.tsx',
      'app/(dashboard)/rentals/[area]/area-results.tsx',
      'app/(dashboard)/dashboard/listings/page.tsx',
    ];
    for (const path of callSites) {
      const fallback = code(path);
      expect(fallback, path).toContain('kycVerified: false');
      expect(fallback, path).toContain('whatsappVerified: false');
    }
  });
});
