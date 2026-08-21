import { describe, expect, it } from 'vitest';
import { contactRemovedLine, scrubContactNumbers } from '@/lib/moderation/contact-scrub';

// The owner has verified exactly this number.
const VERIFIED = ['+94771234567'];

describe('scrubContactNumbers', () => {
  it('removes an unverified number from the description', () => {
    const r = scrubContactNumbers('Lovely 2BR house. Call me on 0777654321 today for a viewing.', VERIFIED);
    expect(r.cleaned).not.toMatch(/0777654321|777654321/);
    expect(r.removed).toEqual(['+94777654321']);
  });

  it("keeps the owner's verified number, however they typed it", () => {
    // The whole point of the exception: a landlord who proved they hold this
    // number may advertise it. Format must not matter.
    for (const written of ['0771234567', '+94771234567', '+94 77 123 4567', '077 123 4567']) {
      const r = scrubContactNumbers(`Ring ${written} anytime.`, VERIFIED);
      expect(r.cleaned).toContain(written);
      expect(r.removed).toEqual([]);
      expect(r.kept).toEqual(['+94771234567']);
    }
  });

  it('removes only the unverified one when both appear', () => {
    const r = scrubContactNumbers('Call 0771234567 or 0759876543 for details.', VERIFIED);
    expect(r.cleaned).toContain('0771234567');
    expect(r.cleaned).not.toContain('0759876543');
    expect(r.removed).toEqual(['+94759876543']);
  });

  it('catches landlines, not just mobiles', () => {
    const r = scrubContactNumbers('Quiet area. Office: 011-2345678. Available now.', VERIFIED);
    expect(r.cleaned).not.toMatch(/2345678/);
    expect(r.removed).toEqual(['+94112345678']);
  });

  // The failure that would matter most: eating a number that was never a phone
  // number. A mangled price or address is a worse outcome than a leaked digit.
  it('never touches rent, deposit or house numbers', () => {
    for (const text of [
      'Rent is 45000 per month, deposit 90000.',
      'No. 15, Mill road, Piliyandala. 2 bedrooms.',
      '3 bedrooms, 2 bathrooms, 1200 sqft, built 2019.',
    ]) {
      const r = scrubContactNumbers(text, VERIFIED);
      expect(r.cleaned).toBe(text);
      expect(r.removed).toEqual([]);
    }
  });

  it('leaves readable prose behind, not a hole', () => {
    // A removal that leaves "Call me on  today" reads as a bug to the renter.
    expect(scrubContactNumbers('Call me on 0777654321 today for a viewing.', VERIFIED).cleaned)
      .toBe('Call me today for a viewing.');
    expect(scrubContactNumbers('Contact - 0777654321 for viewing.', VERIFIED).cleaned)
      .toBe('Contact for viewing.');
    // A number on its own line must not leave a blank one.
    expect(scrubContactNumbers('Nice house\n0777654321\nAvailable now', VERIFIED).cleaned)
      .toBe('Nice house\nAvailable now');
  });

  it('removes everything when the owner has verified nothing', () => {
    // Also the fail-closed path: the lookup returns [] on error, and removing
    // is the safe direction.
    const r = scrubContactNumbers('Call 0771234567 now.', []);
    expect(r.removed).toEqual(['+94771234567']);
    expect(r.cleaned).not.toMatch(/771234567/);
  });

  it('handles empty and absent text', () => {
    expect(scrubContactNumbers('', VERIFIED).cleaned).toBe('');
    expect(scrubContactNumbers(null, VERIFIED).removed).toEqual([]);
  });
});

describe('contactRemovedLine', () => {
  it('tells the landlord what happened without echoing the digits back', () => {
    // The number may belong to a third party; the count is the informative part.
    const one = contactRemovedLine(1);
    expect(one).toMatch(/removed a phone number/i);
    expect(one).toMatch(/verified number/i);
    expect(one).not.toMatch(/\d{6,}/);
    expect(contactRemovedLine(3)).toMatch(/3 phone numbers/);
  });
});
