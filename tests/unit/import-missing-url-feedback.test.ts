import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { firstFacebookUrlIn, parseFacebookUrl } from '@/lib/imports/facebook/url';

/**
 * "I PASTED THE CONTENT BUT CREATE DRAFT STAYS DISABLED."
 *
 * Reported 2026-09-17 against a real Colombo 6 advert. The operator pasted the
 * whole post text, the button read "Create draft", the line beside it read
 * "Facebook is not asked — your text is used as it is", and the button did
 * nothing. Nothing on the screen said why.
 *
 * The gate itself is correct and stays: `ready` is `urlOk && !pending`, and
 * `post_imports.source_url` is NOT NULL because it is the provenance link the
 * review screen and the owner's consent message are both built on. The defect
 * was that the ONLY feedback path, `showUrlError`, requires a non-empty URL
 * field — so leaving it blank produced a dead control and silence, at the exact
 * moment the operator had just done the slow part of the job.
 */
function code(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const FORM = 'app/(dashboard)/back-office/imports/new/import-url-form.tsx';

/** The advert from the report, trimmed to the lines that decide the outcome. */
const PASTED_ADVERT = [
  'https://maps.app.goo.gl/S5eXsDceHJwgzfB47?g_st=awb',
  '3-Bedroom only 17 unit Apartment',
  'Colombo6',
  'Wellawatte North',
  '1091.78 sqft',
  'maintainence fee only Rs.6000 per month',
  '37million',
  '0777008462',
].join('\n');

describe('why the button was disabled', () => {
  /*
   * The advert opens with a link, which is exactly what makes this confusing:
   * the operator can see a URL in the box they pasted into. It is a Google Maps
   * pin, and the lifter only ever wanted a Facebook post.
   */
  it('does not lift a non-Facebook link out of the paste', () => {
    expect(firstFacebookUrlIn(PASTED_ADVERT)).toBeNull();
  });

  it('closes the gate when neither the field nor the paste has a post link', () => {
    const effectiveUrl = '' || firstFacebookUrlIn(PASTED_ADVERT) || '';
    expect(parseFacebookUrl(effectiveUrl)).toBeNull();
  });

  /*
   * And re-opens it on the one thing the operator was missing, with the same
   * text still in the box.
   */
  it('opens once the post link is supplied', () => {
    const url = 'https://www.facebook.com/groups/1234567890/posts/9876543210';
    const effectiveUrl = url.trim() || firstFacebookUrlIn(PASTED_ADVERT) || '';
    expect(parseFacebookUrl(effectiveUrl)).not.toBeNull();
  });
});

describe('the form says why it is disabled', () => {
  /*
   * `showUrlError` is a REJECTED link; `needsUrl` is a MISSING one. Collapsing
   * them back into one state is what produced the silence, so the distinct
   * state has to keep existing.
   */
  it('distinguishes a missing link from a rejected one', () => {
    const src = code(FORM);
    expect(src).toMatch(/const\s+needsUrl\s*=/);
    expect(src).toMatch(/const\s+showUrlError\s*=/);
  });

  /*
   * The caption beside a DISABLED button must not still be advertising how fast
   * the happy path is — that is the line the operator read while nothing
   * happened. Whatever the wording, `needsUrl` has to be consulted before
   * `hasText` decides it.
   */
  it('explains the disabled button before it advertises the cost', () => {
    const src = code(FORM);
    const blockedAt = src.indexOf('Add the Facebook post link above to continue.');
    const costAt = src.indexOf('Facebook is not asked');
    expect(blockedAt).toBeGreaterThan(-1);
    expect(costAt).toBeGreaterThan(-1);
    expect(blockedAt).toBeLessThan(costAt);
  });

  it('points at the field that is actually blocking the submit', () => {
    const src = code(FORM);
    expect(src).toContain('Add the Facebook post link above to continue.');
    expect(src).toContain('Fix the post link above to continue.');
  });

  /*
   * The paste is the expensive part of the job. A message that made the
   * operator think it had been thrown away would send them to re-copy it.
   */
  it('reassures that the pasted text survives', () => {
    const src = code(FORM);
    expect(src).toMatch(/Still needed[\s\S]{0,160}pasted text is kept/);
  });
});
