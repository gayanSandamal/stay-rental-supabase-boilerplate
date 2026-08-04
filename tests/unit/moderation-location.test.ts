import { describe, expect, it } from 'vitest';
import { checkLocationCoherence } from '@/lib/moderation/location';

describe('checkLocationCoherence — hard fails (hold without asking the model)', () => {
  it('catches a city that belongs to a different district', () => {
    const r = checkLocationCoherence({ city: 'Nugegoda', district: 'Kandy' });
    expect(r.hardFail).toBe(true);
    expect(r.hardReasons[0]).toContain('Colombo');
  });

  it('accepts a city with its correct district', () => {
    expect(checkLocationCoherence({ city: 'Nugegoda', district: 'Colombo' }).hardFail).toBe(false);
    expect(checkLocationCoherence({ city: 'Jaffna', district: 'Jaffna' }).hardFail).toBe(false);
  });

  it('catches coordinates outside Sri Lanka', () => {
    const r = checkLocationCoherence({ city: 'Colombo', latitude: 51.5, longitude: -0.12 });
    expect(r.hardFail).toBe(true);
    expect(r.hardReasons[0]).toContain('outside Sri Lanka');
  });

  it('accepts coordinates inside Sri Lanka', () => {
    expect(checkLocationCoherence({ city: 'Colombo', latitude: 6.9271, longitude: 79.8612 }).hardFail).toBe(false);
  });

  it('ignores 0,0 placeholder coordinates rather than failing on them', () => {
    expect(checkLocationCoherence({ city: 'Colombo', latitude: 0, longitude: 0 }).hardFail).toBe(false);
  });
});

describe('checkLocationCoherence — soft notes only (never hold)', () => {
  it('treats an unknown town as a note, not a failure', () => {
    // THE load-bearing rule: ~110 gazetteer towns vs thousands in the country.
    const r = checkLocationCoherence({ city: 'Pallegama', district: 'Matale' });
    expect(r.hardFail).toBe(false);
    expect(r.softNotes.join(' ')).toContain('not in our town list');
  });

  it('does not flag a town-named road as a different city', () => {
    // "Galle Road" in Nugegoda is a road name, not a location contradiction.
    const r = checkLocationCoherence({
      address: '120 Galle Road',
      city: 'Nugegoda',
      district: 'Colombo',
    });
    expect(r.hardFail).toBe(false);
    expect(r.softNotes.join(' ')).not.toContain('Galle');
  });

  it('notes a genuinely different town in the address', () => {
    const r = checkLocationCoherence({
      address: '12 Temple Lane, Dehiwala',
      city: 'Nugegoda',
      district: 'Colombo',
    });
    expect(r.hardFail).toBe(false);
    expect(r.softNotes.join(' ')).toContain('Dehiwala');
  });

  it('notes a description that names other towns but never this one', () => {
    const r = checkLocationCoherence({
      description: 'Close to Kandy and Peradeniya, quiet neighbourhood',
      city: 'Negombo',
      district: 'Gampaha',
    });
    expect(r.hardFail).toBe(false);
    expect(r.softNotes.join(' ')).toMatch(/Kandy|Peradeniya/);
  });

  it('stays silent when the description names the same town', () => {
    const r = checkLocationCoherence({
      description: 'Lovely home in Negombo close to the beach',
      city: 'Negombo',
      district: 'Gampaha',
    });
    expect(r.softNotes.filter((n) => n.includes('Description'))).toHaveLength(0);
  });

  it('handles empty input without throwing', () => {
    const r = checkLocationCoherence({});
    expect(r.hardFail).toBe(false);
    expect(r.softNotes).toEqual([]);
  });

  it('resolves Tamil-script towns via the gazetteer', () => {
    // Added in the foundations commit; proves Tamil listings can now be checked.
    const r = checkLocationCoherence({ city: 'யாழ்ப்பாணம்', district: 'Jaffna' });
    expect(r.hardFail).toBe(false);
    expect(r.softNotes.join(' ')).not.toContain('not in our town list');
  });

  it('catches a Tamil-script city in the wrong district', () => {
    const r = checkLocationCoherence({ city: 'மட்டக்களப்பு', district: 'Colombo' });
    expect(r.hardFail).toBe(true);
    expect(r.hardReasons[0]).toContain('Batticaloa');
  });
});
