import { describe, expect, it } from 'vitest';
import {
  deleteDoneMessage,
  listingLiveNoLinksMessage,
  listingPendingNoLinksMessage,
  manualReviewMessage,
  needsInfoMessage,
  photosMissedMessage,
  publishedMessage,
  receivedAckMessage,
  restoreRequestedMessage,
  summarizeUnderstood,
} from '@/lib/intake/messages';

/**
 * These strings ARE the product for a WhatsApp landlord — pin the behaviors
 * the UX overhaul introduced so copy edits can't quietly regress them.
 */

describe('summarizeUnderstood', () => {
  it('describes what the parser extracted', () => {
    expect(
      summarizeUnderstood({ propertyType: 'house', bedrooms: 5, city: 'Kolonnawa', rentPerMonth: null })
    ).toBe('a 5-bedroom house in Kolonnawa');
  });

  it('includes the rent when known', () => {
    expect(
      summarizeUnderstood({ propertyType: 'apartment', bedrooms: 2, city: 'Nugegoda', rentPerMonth: 85000 })
    ).toBe('a 2-bedroom apartment in Nugegoda for LKR 85,000/month');
  });

  it('returns null when nothing useful was extracted', () => {
    expect(summarizeUnderstood({})).toBeNull();
    expect(summarizeUnderstood({ propertyType: 'unknown' as any, bedrooms: null })).toBeNull();
  });

  it('falls back to "property" when only non-type fields are known', () => {
    expect(summarizeUnderstood({ city: 'Kandy' })).toBe('a property in Kandy');
  });
});

describe('needsInfoMessage', () => {
  it('echoes what was understood before asking for the rest', () => {
    const m = needsInfoMessage('Gayan', ['address', 'rentPerMonth'], null, {
      understood: 'a 5-bedroom house in Kolonnawa',
    });
    expect(m).toContain('Got it — a 5-bedroom house in Kolonnawa.');
    expect(m).toContain('the street address and the monthly rent');
    // The echo must come before the ask.
    expect(m.indexOf('Got it')).toBeLessThan(m.indexOf('we still need'));
  });

  it('joins three missing fields naturally, not as CSV', () => {
    const m = needsInfoMessage(null, ['address', 'city', 'rentPerMonth'], null, {});
    expect(m).toContain('the street address, the town or city and the monthly rent');
  });

  it('does not append the reply-here tail to full-sentence fallback reasons', () => {
    const reason =
      'The monthly rent of LKR 4,000 looks unusual — rents on Easy Rent are between LKR 5,000 and LKR 3,000,000. Please reply with the correct monthly rent';
    const m = needsInfoMessage('Nimal', [], reason, {});
    expect(m).toContain(reason);
    expect(m).not.toContain('Just reply here with the details');
    expect(m).not.toContain('outside plausible range');
  });

  it('reads without an echo exactly as a plain ask', () => {
    const m = needsInfoMessage('Gayan', ['rentPerMonth'], null, {});
    expect(m).toBe(
      'Thanks Gayan! To publish we still need: the monthly rent. Just reply here with the details.'
    );
  });
});

describe('instant + status messages', () => {
  it('receivedAckMessage sets the expectation of a short wait', () => {
    expect(receivedAckMessage('Gayan')).toContain('few minutes');
    expect(receivedAckMessage(null)).not.toContain(', !');
  });

  it('manualReviewMessage never reveals why the listing was flagged', () => {
    const m = manualReviewMessage('Gayan');
    expect(m).toContain('taking a quick look');
    expect(m).not.toMatch(/duplicate|suspicious|scam|flag/i);
  });

  it('photosMissedMessage pluralises', () => {
    expect(photosMissedMessage(1)).toContain('1 photo ');
    expect(photosMissedMessage(3)).toContain('3 photos ');
  });
});

describe('publishedMessage', () => {
  it('announces the 48h photo-append window', () => {
    const m = publishedMessage('2BR House in Kandy', { viewUrl: 'https://easyrent.lk/listings/3' });
    expect(m).toContain('send them here within 2 days');
  });

  it('keeps the view URL first so WhatsApp previews it', () => {
    const m = publishedMessage('X', {
      viewUrl: 'https://easyrent.lk/listings/3',
      editUrl: 'https://easyrent.lk/l/e/tok',
    });
    expect(m.indexOf('listings/3')).toBeLessThan(m.indexOf('/l/e/tok'));
  });
});

describe('listingLiveNoLinksMessage', () => {
  it('points at the live listing instead of claiming none exist', () => {
    const m = listingLiveNoLinksMessage('2BR House in Kandy', 'https://easyrent.lk/listings/3');
    expect(m).toContain('is live here');
    expect(m).toContain('https://easyrent.lk/listings/3');
    expect(m).not.toContain("don't have any live listings");
  });
});

describe('deleteDoneMessage', () => {
  it('advertises the RESTORE command and the 30-day window', () => {
    const m = deleteDoneMessage('X');
    expect(m).toContain('RESTORE');
    expect(m).toContain('within 30 days');
  });
});

describe('restore + pending-no-links messages', () => {
  it('restoreRequestedMessage names the listing and promises a follow-up', () => {
    const m = restoreRequestedMessage('2BR House in Kandy');
    expect(m).toContain('2BR House in Kandy');
    expect(m).toContain('restore');
  });

  it('listingPendingNoLinksMessage never claims the listing is live or links it', () => {
    const m = listingPendingNoLinksMessage('2BR House in Kandy');
    expect(m).not.toMatch(/is live/i);
    expect(m).not.toContain('http');
    expect(m).toContain('review');
  });
});
