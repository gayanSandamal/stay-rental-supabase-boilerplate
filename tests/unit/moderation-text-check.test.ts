import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The gazetteer override, tested where it actually lives.
 *
 * `moderation-location.test.ts` proves the gazetteer CONFIRMS Padukka/Colombo.
 * This proves that confirmation actually overrules the model — which is the
 * half that was missing on 2026-08-23, when listing #24 was held on:
 *
 *   "Padukka is in the Sabaragamuwa Province, not Colombo"
 *
 * Padukka is in Colombo District. The landlord saw "our team is reviewing your
 * listing" and then nothing for half an hour.
 */

const chatJson = vi.hoisted(() => vi.fn());

vi.mock('@/lib/moderation/client', () => ({ chatJson }));

// The prompt module pulls in config; the call itself is faked, so only the
// response shape matters here.
const modelSays = (body: Record<string, unknown>) =>
  chatJson.mockResolvedValue({
    data: body,
    usage: { inputTokens: 1, outputTokens: 1 },
    error: null,
  });

async function run(listing: Record<string, unknown>) {
  vi.resetModules();
  const { checkText } = await import('@/lib/moderation/text-check');
  return checkText(listing as never);
}

const PADUKKA = {
  title: '3BR House in Padukka',
  description: 'නිදන කාමර 3 යි නාන කාමර 2 යි. පාදුක්ක නගරයට ආසන්නයි.',
  city: 'Padukka',
  district: 'Colombo',
};

beforeEach(() => chatJson.mockReset());

describe('gazetteer overrules the model on location', () => {
  it('THE REGRESSION: a confirmed city/district survives the model saying otherwise', async () => {
    modelSays({
      language: 'si',
      describes_same_property: true,
      location_consistent: false,
      location_mismatch_reason:
        'The town listed is Padukka, but the district is Colombo, which is inconsistent as Padukka is in the Sabaragamuwa Province, not Colombo.',
      looks_like_rental_listing: true,
    });

    const { verdict } = await run(PADUKKA);

    // The listing must NOT be held on this.
    expect(verdict.locationCoherent).toBe(true);
    // And the model's false claim must not survive into the hold reasons,
    // where it would be shown to ops as if it were true.
    expect(verdict.reasons.join(' ')).not.toMatch(/Sabaragamuwa/);
  });

  it('records the override so ops can see it happened', async () => {
    modelSays({
      language: 'si',
      describes_same_property: true,
      location_consistent: false,
      location_mismatch_reason: 'Padukka is in Sabaragamuwa.',
      looks_like_rental_listing: true,
    });

    const { verdict } = await run(PADUKKA);
    // Silent overrides are how a bad prompt goes unnoticed for months.
    expect(verdict.deterministicNotes.join(' ')).toMatch(/overruled/i);
    expect(verdict.deterministicNotes.join(' ')).toMatch(/Sabaragamuwa/);
  });

  it('leaves every OTHER model finding intact', async () => {
    modelSays({
      language: 'si',
      describes_same_property: true,
      location_consistent: false,
      location_mismatch_reason: 'Padukka is in Sabaragamuwa.',
      // The model is still trusted about this, and it must still hold.
      looks_like_rental_listing: false,
      spam_reason: 'Looks like an advertisement for a service, not a rental.',
    });

    const { verdict } = await run(PADUKKA);
    expect(verdict.locationCoherent).toBe(true);
    expect(verdict.looksLikeRental).toBe(false);
    expect(verdict.reasons.join(' ')).toMatch(/advertisement for a service/);
  });

  it('does NOT overrule for a town the gazetteer does not know', async () => {
    // No curated authority here, so the model keeps the last word — which is
    // the correct behaviour, not an oversight.
    modelSays({
      language: 'en',
      describes_same_property: true,
      location_consistent: false,
      location_mismatch_reason: 'The stated district does not match the town.',
      looks_like_rental_listing: true,
    });

    const { verdict } = await run({
      title: 'House in Nowherevillage',
      description: 'A house for rent.',
      city: 'Nowherevillage',
      district: 'Colombo',
    });

    expect(verdict.locationCoherent).toBe(false);
    expect(verdict.reasons.join(' ')).toMatch(/does not match/);
  });

  it('a genuine gazetteer contradiction still holds, without asking the model', async () => {
    const { verdict } = await run({ ...PADUKKA, district: 'Kandy' });
    expect(verdict.locationCoherent).toBe(false);
    // Decided deterministically — no tokens spent.
    expect(chatJson).not.toHaveBeenCalled();
  });
});

/**
 * A title WE wrote cannot be evidence against the landlord.
 *
 * Listing #25 (2026-08-23) was held on:
 *
 *   "Title describes a apartment but the description describes a house."
 *
 * The title was "2BR Apartment in හොරණ" — composed by composeTitle() from our
 * own parser's output. The landlord wrote "නිවසක්, මහල් නිවාසයක උඩු මහල",
 * the upper floor of a two-storey house, which is fairly called either; our
 * detectPropertyType tests මහල් before නිවස and picked apartment. So the
 * listing was held because two of our own readings disagreed, and the landlord
 * — who never saw the title and could not have changed it — got "our team is
 * reviewing your listing" and nothing else.
 */
describe('a self-generated title never holds a listing', () => {
  const HORANA = {
    title: '2BR Apartment in Horana',
    description: 'නිවසක්, මහල් නිවාසයක උඩු මහල. හොරණ නගරයේ. කාමර 2, කුලිය 25000.',
    city: 'Horana',
    district: 'Kalutara',
  };

  it('THE REGRESSION: listing #25 publishes instead of being held', async () => {
    modelSays({
      language: 'si',
      title_property: { type: 'apartment', bedrooms: 2 },
      description_property: { type: 'house', bedrooms: 2 },
      describes_same_property: false,
      difference_reason: 'Title describes an apartment but the description describes a house.',
      location_consistent: true,
      looks_like_rental_listing: true,
    });

    const { verdict } = await run(HORANA);

    expect(verdict.titleCoherent).toBe(true);
    // And the landlord must not be handed a reason they cannot act on.
    expect(verdict.reasons.join(' ')).not.toMatch(/describes a house/);
  });

  it('records the override so a bad propertyType rule cannot hide forever', async () => {
    modelSays({
      language: 'si',
      title_property: { type: 'apartment', bedrooms: 2 },
      description_property: { type: 'house', bedrooms: 2 },
      describes_same_property: false,
      difference_reason: 'Title describes an apartment but the description describes a house.',
      looks_like_rental_listing: true,
    });

    const { verdict } = await run(HORANA);
    expect(verdict.deterministicNotes.join(' ')).toMatch(/generated by our own parser/i);
    expect(verdict.deterministicNotes.join(' ')).toMatch(/apartment|house/i);
  });

  it('a title the LANDLORD wrote is still held on a real mismatch', async () => {
    // Two properties pasted into one submission is a genuine problem, and this
    // title is nothing composeTitle could ever emit.
    modelSays({
      language: 'en',
      title_property: { type: 'house', bedrooms: 3 },
      description_property: { type: 'room', bedrooms: 1 },
      describes_same_property: false,
      difference_reason: 'Title describes a house but the description describes a single room.',
      looks_like_rental_listing: true,
    });

    const { verdict } = await run({
      title: 'Lovely family home, also single rooms available',
      description: 'One room to let, shared kitchen and bathroom.',
      city: 'Kandy',
      district: 'Kandy',
    });

    expect(verdict.titleCoherent).toBe(false);
    expect(verdict.reasons.join(' ')).toMatch(/single room/);
  });

  it('leaves every OTHER finding intact on a generated title', async () => {
    modelSays({
      language: 'si',
      title_property: { type: 'apartment' },
      description_property: { type: 'house' },
      describes_same_property: false,
      difference_reason: 'Title/description differ.',
      looks_like_rental_listing: false,
      spam_reason: 'Reads like an advertisement for a broker service.',
    });

    const { verdict } = await run(HORANA);
    expect(verdict.titleCoherent).toBe(true);
    expect(verdict.looksLikeRental).toBe(false);
    expect(verdict.reasons.join(' ')).toMatch(/broker service/);
  });

  it('a coherent generated title adds no note', async () => {
    modelSays({
      language: 'si',
      title_property: { type: 'house', bedrooms: 2 },
      description_property: { type: 'house', bedrooms: 2 },
      describes_same_property: true,
      looks_like_rental_listing: true,
    });

    const { verdict } = await run({ ...HORANA, title: '2BR House in Horana' });
    expect(verdict.titleCoherent).toBe(true);
    expect(verdict.deterministicNotes.join(' ')).not.toMatch(/generated by our own parser/i);
  });
});
