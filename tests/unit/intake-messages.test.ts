import { describe, expect, it } from 'vitest';
import {
  deleteDoneMessage,
  listingLiveNoLinksMessage,
  listingPendingNoLinksMessage,
  manualReviewMessage,
  cityChoiceMessage,
  cityChosenMessage,
  cityKeptMessage,
  needsInfoMessage,
  newListingTemplateMessage,
  photosMissedMessage,
  photosAddedMessage,
  pendingReviewMessage,
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

  it('newListingTemplateMessage lists the required fields and greets by name', () => {
    const m = newListingTemplateMessage('Gayan');
    expect(m).toContain('Thanks Gayan!');
    for (const field of [
      'Property type',
      'Address',
      'Town / city',
      'bedrooms',
      'bathrooms',
      'Monthly rent',
      'photos',
    ]) {
      expect(m).toContain(field);
    }
    // Must reassure free-form replies — owners rarely follow the list exactly.
    expect(m).toMatch(/Sinhala or English/i);
  });

  // The sender's WhatsApp number is already attached as a VERIFIED contact and
  // the parser discards typed phone numbers — asking for one collects nothing
  // and implies the typed number is what tenants would see.
  it('newListingTemplateMessage never asks for a contact number', () => {
    const m = newListingTemplateMessage('Gayan');
    expect(m).not.toMatch(/•.*contact number/i);
    expect(m).not.toMatch(/phone number/i);
    expect(m).toMatch(/contact you on this WhatsApp number/i);
  });

  it('newListingTemplateMessage stays clean without a profile name', () => {
    const m = newListingTemplateMessage(null);
    expect(m.startsWith('Thanks!')).toBe(true);
    expect(m).not.toContain(', !');
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

describe('pendingReviewMessage links', () => {
  // With the automated checks armed every intake lands pending, so this is the
  // ONLY message that can hand the landlord a remove link — publishedMessage is
  // never sent and the approval notice is a bare public URL.
  it('offers both the edit and the remove link', () => {
    const m = pendingReviewMessage('2BR House in Dehiwala', {
      editUrl: 'https://easyrent.lk/l/tok/e/12',
      deleteUrl: 'https://easyrent.lk/l/tok/d/12',
    });
    expect(m).toContain('https://easyrent.lk/l/tok/e/12');
    expect(m).toContain('https://easyrent.lk/l/tok/d/12');
    expect(m).toMatch(/remove/i);
    // Never a "live" claim or a public URL — it is still pending.
    expect(m).not.toMatch(/is live/i);
  });

  it('omits the remove line when no delete link could be minted', () => {
    const m = pendingReviewMessage('X', { editUrl: 'https://easyrent.lk/l/tok/e/12' });
    expect(m).toContain('/e/12');
    expect(m).not.toMatch(/remove it/i);
  });

  it('stays byte-identical to the no-links copy when nothing was minted', () => {
    expect(pendingReviewMessage('X', null)).toBe(pendingReviewMessage('X'));
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

describe('over-cap photo copy', () => {
  const links = { viewUrl: 'https://easyrent.lk/listings/3' };

  // Regression pin: with nothing over the cap the output must be byte-identical
  // to what it was before the cap existed.
  it('adds nothing when no photo was refused', () => {
    expect(publishedMessage('X', links, { photosOverCap: 0, photoCap: 6 })).toBe(
      publishedMessage('X', links)
    );
    expect(pendingReviewMessage('X', null, { photosOverCap: 0, photoCap: 6 })).toBe(
      pendingReviewMessage('X', null)
    );
  });

  it('names the limit, the leftover count and how to swap', () => {
    const m = publishedMessage('X', links, { photosOverCap: 3, photoCap: 6 });
    expect(m).toContain('6 photos per listing');
    expect(m).toContain('3 weren’t used');
    expect(m).toMatch(/swap/i);
  });

  it('reads naturally for a single leftover', () => {
    expect(publishedMessage('X', links, { photosOverCap: 1, photoCap: 6 })).toContain(
      'one wasn’t used'
    );
  });

  it('appears on the pending-review copy too', () => {
    expect(pendingReviewMessage('X', null, { photosOverCap: 2, photoCap: 6 })).toContain(
      '2 weren’t used'
    );
  });

  it('says nothing when there is no cap', () => {
    expect(publishedMessage('X', links, { photosOverCap: 2, photoCap: Infinity })).toBe(
      publishedMessage('X', links)
    );
  });
});

describe('photosAddedMessage', () => {
  it('promises visibility only when the photo is already public', () => {
    expect(photosAddedMessage('X', 2, 0)).toContain('Added 2 photos');
  });

  // Armed moderation holds the photo for ~2 min; saying "added" would send the
  // landlord looking for something that is not there yet.
  it('says "checking" when the photo is queued', () => {
    const m = photosAddedMessage('X', 1, 0, { queued: true });
    expect(m).not.toContain('Added 1 photo');
    expect(m).toMatch(/couple of minutes/);
  });

  it('reports over-cap photos without asking for a resend', () => {
    const m = photosAddedMessage('X', 1, 0, { overCap: 2 });
    expect(m).toContain('photo limit');
    expect(m).not.toMatch(/send .* again/);
  });
});

describe('town disambiguation copy', () => {
  const choices = [
    { city: 'Gampaha', district: 'Gampaha' },
    { city: 'Gampola', district: 'Kandy' },
  ];

  it('numbers every option and always offers to keep their spelling', () => {
    const m = cityChoiceMessage('Gayan', 'Gampaga', choices);
    expect(m).toContain('1. Gampaha (Gampaha District)');
    expect(m).toContain('2. Gampola (Kandy District)');
    // The escape hatch is the last number, so a town we have never heard of
    // can never trap the sender in the menu.
    expect(m).toContain('3. Keep "Gampaga" as I typed it');
    expect(m).toContain('1 to 3');
  });

  it('quotes back exactly what they typed, so a wrong reading is visible', () => {
    expect(cityChoiceMessage(null, 'Udugampola', choices)).toContain('"Udugampola"');
  });

  it('confirms the choice with its district, not just the name', () => {
    expect(cityChosenMessage('Gampola', 'Kandy')).toContain('Gampola, Kandy District');
  });

  it('tells a keeper their spelling stands and is being reviewed', () => {
    const m = cityKeptMessage('Gampaga');
    expect(m).toContain('"Gampaga"');
    expect(m).toMatch(/town list/i);
  });
});
