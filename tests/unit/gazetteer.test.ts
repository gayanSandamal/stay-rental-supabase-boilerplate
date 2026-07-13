import { describe, expect, it } from 'vitest';
import { CITIES, DISTRICTS, matchCity, matchDistrict } from '@/lib/intake/parser/gazetteer';

describe('gazetteer data', () => {
  it('has all 25 districts', () => {
    expect(DISTRICTS).toHaveLength(25);
  });

  it('every city maps to a known district', () => {
    for (const c of CITIES) {
      expect(DISTRICTS).toContain(c.district);
    }
  });

  it('has no duplicate canonical names', () => {
    const names = CITIES.map((c) => c.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('matchCity', () => {
  it('matches a plain city with word boundaries', () => {
    expect(matchCity('house in nugegoda for rent')).toEqual({
      city: 'Nugegoda',
      district: 'Colombo',
    });
  });

  it('does not match inside a longer word', () => {
    expect(matchCity('the ellamawatta estate')).toBeNull();
  });

  it('prefers the longer name when names overlap', () => {
    expect(matchCity('12 galle road, nugegoda')?.city).toBe('Nugegoda');
  });

  it('resolves colombo ward numbers, with leading zeros', () => {
    expect(matchCity('apartment colombo 05')?.city).toBe('Colombo 5');
    expect(matchCity('colombo-7 house')?.city).toBe('Colombo 7');
    expect(matchCity('colombo 15 flat')?.city).toBe('Colombo 15');
  });

  it('falls back to bare colombo for out-of-range wards', () => {
    expect(matchCity('colombo 16 zone')?.city).toBe('Colombo');
  });

  it('resolves aliases to the canonical city', () => {
    expect(matchCity('mt lavinia beach side')?.city).toBe('Mount Lavinia');
    expect(matchCity('wellawatte sea view')?.city).toBe('Colombo 6');
    expect(matchCity('borella junction')?.city).toBe('Colombo 8');
  });

  it('matches sinhala script aliases', () => {
    expect(matchCity('නුගේගොඩ house')?.city).toBe('Nugegoda');
  });

  it('returns null for unknown places', () => {
    expect(matchCity('a house in springfield')).toBeNull();
  });
});

describe('matchDistrict', () => {
  it('matches an explicit district mention', () => {
    expect(matchDistrict('available in monaragala district')).toBe('Monaragala');
  });

  it('matches a standalone district name', () => {
    expect(matchDistrict('anywhere in gampaha is fine')).toBe('Gampaha');
  });

  it('returns null when no district appears', () => {
    expect(matchDistrict('a nice quiet neighbourhood')).toBeNull();
  });
});
