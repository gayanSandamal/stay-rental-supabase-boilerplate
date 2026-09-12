import { describe, expect, it } from 'vitest';
import { computeFingerprint } from '@/lib/properties/fingerprint-pure';

describe('computeFingerprint', () => {
  it('is null with no address — never guesses a property from city alone', () => {
    expect(computeFingerprint({ address: null, city: 'Colombo', bedrooms: 2 })).toBeNull();
  });

  it('is null when the normalized address has almost no signal', () => {
    expect(computeFingerprint({ address: '12', city: 'Colombo', bedrooms: 2 })).toBeNull();
  });

  it('collides on common address-word variants (the exact-match dedup gap)', () => {
    // The finding this exists to fix: "12 Galle Rd" and "No.12, Galle Road"
    // do NOT collide under app/api/listings/route.ts's exact eq() dedup.
    const a = computeFingerprint({ address: '12 Galle Rd', city: 'Colombo', bedrooms: 2 });
    const b = computeFingerprint({
      address: 'No.12, Galle Road',
      city: 'Colombo',
      bedrooms: 2,
    });
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });

  it('is case- and whitespace-insensitive', () => {
    const a = computeFingerprint({ address: '45 Flower Road', city: 'Colombo', bedrooms: 3 });
    const b = computeFingerprint({
      address: '  45   flower   road  ',
      city: 'colombo',
      bedrooms: 3,
    });
    expect(a).toBe(b);
  });

  it('does not collide across different cities for the same street', () => {
    const a = computeFingerprint({ address: '10 Main St', city: 'Colombo', bedrooms: 2 });
    const b = computeFingerprint({ address: '10 Main St', city: 'Kandy', bedrooms: 2 });
    expect(a).not.toBe(b);
  });

  it('does not collide across different bedroom counts at the same address', () => {
    // A false negative here just means two attachments end up on separate
    // property rows — the status quo today, and a safe direction to fail in.
    const a = computeFingerprint({ address: '10 Main St', city: 'Colombo', bedrooms: 2 });
    const b = computeFingerprint({ address: '10 Main St', city: 'Colombo', bedrooms: 3 });
    expect(a).not.toBe(b);
  });
});
