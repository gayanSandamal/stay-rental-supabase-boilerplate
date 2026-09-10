import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { capPhotos, effectiveCap } from '@/lib/images/cap';

/**
 * A seven-photo advert against a cap of six. capPhotos records the extra in the
 * manifest as a reject, so the data layer is honest — but the operator was told
 * nothing, on either of the two ways photos go missing here:
 *
 *  - over the cap: the uploader blocks a seventh FILE, while pasted URLs go
 *    through addPhotoUrlsAction, which has no cap check at all.
 *  - refused: addPhotoUrlsAction has always redirected with ?added&refused and
 *    the page never read either one.
 */
function code(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('effectiveCap is the one decision, reachable from both sides', () => {
  it('is no cap at all when enforcement is off', () => {
    expect(effectiveCap(false, 6)).toBe(Infinity);
  });

  it('is no cap when the configured value is nonsense', () => {
    // A fat-fingered 0 in the back office must not blank every gallery.
    for (const value of [0, -1, null, undefined, 'six', NaN]) {
      expect(effectiveCap(true, value)).toBe(Infinity);
    }
  });

  it('floors a real value', () => {
    expect(effectiveCap(true, 6)).toBe(6);
    expect(effectiveCap(true, 6.9)).toBe(6);
  });

  it('drops nothing when uncapped, however many photos there are', () => {
    const seven = Array.from({ length: 7 }, (_, i) => `p${i}`);
    expect(capPhotos(seven, effectiveCap(false, 6)).dropped).toHaveLength(0);
    expect(capPhotos(seven, effectiveCap(true, 6)).dropped).toHaveLength(1);
  });

  it('is what photoCap() returns, so server and client cannot drift', () => {
    const cap = code('lib/images/cap.ts');
    const fn = cap.slice(cap.indexOf('export function photoCap'));
    expect(fn.slice(0, fn.indexOf('\n}'))).toContain('effectiveCap(');
  });
});

describe('the review screen warns before it drops', () => {
  const form = code('app/(dashboard)/back-office/imports/[id]/review-form.tsx');

  it('computes the overage with the publish-path functions, not its own maths', () => {
    expect(form).toContain('effectiveCap(');
    expect(form).toContain('capPhotos(photoUrls, photoCap).dropped.length');
  });

  it('reads enforcePhotoCap, not just the number', () => {
    expect(form).toContain("useFeatureFlag('enforcePhotoCap')");
  });

  it('tells the operator they can choose which photos survive', () => {
    // The cover controls reorder the album, which is what makes the cap a
    // choice rather than an accident of paste order.
    expect(form).toMatch(/Reorder them below to choose which/);
  });
});

describe('a refused paste is visible', () => {
  it('the action still reports both counts', () => {
    const actions = code('app/(dashboard)/back-office/imports/actions.ts');
    expect(actions).toContain('?added=${stored.length}&refused=${refused}');
  });

  it('and the page now reads them', () => {
    const page = code('app/(dashboard)/back-office/imports/[id]/page.tsx');
    expect(page).toContain('added?: string');
    expect(page).toContain('refused?: string');
    expect(page).toContain('photoResult(query.added, query.refused)');
  });
});
