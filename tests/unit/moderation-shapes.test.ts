import { describe, expect, it } from 'vitest';
import { comparePropertyShapes } from '@/lib/moderation/text-check';

/**
 * Title↔description coherence is computed here, in code, from the shapes the
 * model extracts — NOT taken as the model's yes/no opinion. Live calibration
 * showed an 8B model calling "3BR House" coherent with "single room, shared
 * kitchen" when simply asked, but reporting both shapes correctly. These tests
 * pin the comparison so a prompt edit can't quietly regress it.
 */

describe('comparePropertyShapes', () => {
  it('accepts a genuine match', () => {
    const r = comparePropertyShapes({ type: 'house', bedrooms: 3 }, { type: 'house', bedrooms: 3 });
    expect(r.coherent).toBe(true);
    expect(r.reason).toBeNull();
  });

  it('rejects a house title over a shared-room description (the live failure)', () => {
    const r = comparePropertyShapes({ type: 'house', bedrooms: 3 }, { type: 'room', bedrooms: 1 });
    expect(r.coherent).toBe(false);
    expect(r.reason).toContain('house');
    expect(r.reason).toContain('room');
  });

  it('rejects house vs apartment', () => {
    expect(comparePropertyShapes({ type: 'house' }, { type: 'apartment' }).coherent).toBe(false);
  });

  it('treats annex and house as compatible — the parser stores annex as a house', () => {
    expect(comparePropertyShapes({ type: 'annex', bedrooms: 1 }, { type: 'house', bedrooms: 1 }).coherent).toBe(true);
    expect(comparePropertyShapes({ type: 'house' }, { type: 'annex' }).coherent).toBe(true);
  });

  it('rejects a bedroom-count contradiction', () => {
    const r = comparePropertyShapes({ type: 'house', bedrooms: 3 }, { type: 'house', bedrooms: 1 });
    expect(r.coherent).toBe(false);
    expect(r.reason).toContain('3');
    expect(r.reason).toContain('1');
  });

  it('never fails on unknown or missing information', () => {
    // A landlord who omits detail must not be held for it.
    expect(comparePropertyShapes({ type: 'unknown' }, { type: 'house', bedrooms: 2 }).coherent).toBe(true);
    expect(comparePropertyShapes({ type: 'house' }, { type: 'unknown' }).coherent).toBe(true);
    expect(comparePropertyShapes(undefined, undefined).coherent).toBe(true);
    expect(comparePropertyShapes({}, {}).coherent).toBe(true);
    expect(comparePropertyShapes({ type: 'house', bedrooms: null }, { type: 'house', bedrooms: 3 }).coherent).toBe(true);
  });

  it('ignores case and unrecognised type strings', () => {
    expect(comparePropertyShapes({ type: 'HOUSE' }, { type: 'House' }).coherent).toBe(true);
    // An unexpected label is treated as no opinion rather than a mismatch.
    expect(comparePropertyShapes({ type: 'villa' }, { type: 'house' }).coherent).toBe(true);
  });

  it('accepts a room titled as a room', () => {
    expect(comparePropertyShapes({ type: 'room', bedrooms: 1 }, { type: 'room', bedrooms: 1 }).coherent).toBe(true);
  });
});
