import { describe, expect, it } from 'vitest';
import {
  NEEDS_INFO_MAX_ROUNDS,
  adoptAnswer,
  appendPendingAnswer,
  carryForward,
  parseStoredPayload,
} from '@/lib/intake/accumulator';
import { parseIntakeRules } from '@/lib/intake/parser/rule-parser';
import type { ParsedIntake } from '@/lib/intake/parser/types';
import { computeMissingFields } from '@/lib/intake/parser/types';

/**
 * The 2026-08-23 Horana loop (intake #31), reconstructed from the stored
 * message_text. The landlord answered every question and the bot kept asking.
 */

/** The four turns, exactly as they arrived. */
const TURNS = [
  'හොරණ උඩුමහලක් කුලියට දීමට ඇත.\n ▪️සාලය\n▪️කාමර 2\n▪️මුලුතැන්ගෙය \n▪️නාන කාමරය\n▪️25000/-\n▪️Key money මාස 4\n▪️විමසන්න 078 746 6719\n\n▪️Broker ගාස්තු අය කෙරේ( මසක කුලියකින් අඩක් )',
  'ලිපිනය- හොරණ ප්‍රධාන මාර්ගයට යාබදව',
  'නිවසක්, මහල් නිවාසයක උඩු මහල.\nහොරණ නගරයේ',
  'ලිපිනය- හොරණ ප්‍රධාන මාර්ගයට යාබදව',
];

const base = (over: Partial<ParsedIntake> = {}): ParsedIntake => ({
  title: null,
  propertyType: null,
  address: null,
  city: null,
  district: null,
  bedrooms: null,
  bathrooms: null,
  rentPerMonth: null,
  description: null,
  missingFields: [],
  suspicious: false,
  suspicionReason: null,
  ...over,
});

describe('carryForward — knowledge only grows', () => {
  it('THE REGRESSION: a field known last turn is never asked for again', () => {
    // What the pipeline knew after turn 1 (the LLM had composed a title).
    const afterTurn1 = base({
      title: '2BR Apartment in Horana',
      propertyType: 'apartment',
      bedrooms: 2,
      rentPerMonth: 25000,
      city: 'Horana',
      district: 'Kalutara',
    });
    // Turn 2 re-parses the whole blob and the LLM, asked a different question
    // this time, returns no title. Without carry-forward this is the moment
    // the landlord was asked for the property type they had already given.
    const turn2 = base({ bedrooms: 2, rentPerMonth: 25000 });
    turn2.missingFields = computeMissingFields(turn2);
    expect(turn2.missingFields).toContain('title');

    const merged = carryForward(afterTurn1, turn2);
    expect(merged.title).toBe('2BR Apartment in Horana');
    expect(merged.propertyType).toBe('apartment');
    expect(merged.missingFields).not.toContain('title');
  });

  it('the ask never grows across the real four turns', () => {
    let accumulated: ParsedIntake | null = null;
    let blob = '';
    const asks: string[][] = [];

    for (const turn of TURNS) {
      blob = [blob, turn].filter(Boolean).join('\n');
      accumulated = carryForward(accumulated, parseIntakeRules(blob));
      asks.push([...accumulated.missingFields]);
    }

    // Each round asks for a subset of the round before it. This is the whole
    // invariant: answering a question can never produce more questions.
    for (let i = 1; i < asks.length; i++) {
      for (const field of asks[i]) {
        expect(asks[i - 1], `round ${i + 1} newly asked for "${field}"`).toContain(field);
      }
    }
  });

  it('a correction wins over the remembered value', () => {
    const previous = base({ rentPerMonth: 25000, bedrooms: 2 });
    const fresh = base({ rentPerMonth: 30000 });
    const merged = carryForward(previous, fresh);
    expect(merged.rentPerMonth).toBe(30000);
    expect(merged.bedrooms).toBe(2);
  });

  it('town and district move as a pair, never mixed across turns', () => {
    // The #24 failure mode: one turn's town with another turn's district.
    const previous = base({ city: 'Padukka', district: 'Colombo' });
    const fresh = base({ city: 'Kandy', district: null });
    const merged = carryForward(previous, fresh);
    expect(merged.city).toBe('Kandy');
    expect(merged.district).toBe('Kandy');
    expect(merged.district).not.toBe('Colombo');
  });

  it('inherits the district only when it belongs to the carried town', () => {
    const previous = base({ city: 'Horana', district: 'Kalutara' });
    const fresh = base({ bedrooms: 3 });
    const merged = carryForward(previous, fresh);
    expect(merged.city).toBe('Horana');
    expect(merged.district).toBe('Kalutara');
  });

  it('a later clean turn cannot clear a safety flag raised earlier', () => {
    const previous = base({ suspicious: true, suspicionReason: 'advance fee', multiProperty: true });
    const merged = carryForward(previous, base({ bedrooms: 2 }));
    expect(merged.suspicious).toBe(true);
    expect(merged.multiProperty).toBe(true);
    expect(merged.suspicionReason).toContain('advance fee');
  });

  it('drops a stale town shortlist once the town is settled', () => {
    const previous = base({
      cityCandidates: [{ city: 'Piliyandala', district: 'Colombo', similarity: 0.9 }],
      cityTyped: 'Puluyandala',
    });
    const merged = carryForward(previous, base({ city: 'Piliyandala', district: 'Colombo' }));
    expect(merged.cityCandidates).toBeUndefined();
    expect(merged.cityTyped).toBeUndefined();
  });

  it('no previous state is a pass-through', () => {
    const fresh = base({ bedrooms: 2 });
    expect(carryForward(null, fresh)).toBe(fresh);
  });
});

describe('adoptAnswer — a reply to a question is an answer', () => {
  it('THE REGRESSION: the landmark address we asked for twice is accepted', () => {
    const parsed = base({ city: 'Horana', district: 'Kalutara', bedrooms: 2, rentPerMonth: 25000 });
    parsed.missingFields = computeMissingFields(parsed);

    const { parsed: next, adopted } = adoptAnswer(
      parsed,
      ['address'],
      'ලිපිනය- හොරණ ප්‍රධාන මාර්ගයට යාබදව'
    );
    expect(adopted).toEqual(['address']);
    // The "ලිපිනය-" label is scaffolding, not part of the address.
    expect(next.address).toBe('හොරණ ප්‍රධාන මාර්ගයට යාබදව');
    expect(next.missingFields).not.toContain('address');
  });

  it.each([
    ['Address: 42 Temple Road, next to the school', '42 Temple Road, next to the school'],
    ['முகவரி: பிரதான வீதிக்கு அருகில்', 'பிரதான வீதிக்கு அருகில்'],
    ['near the Kaduwela junction', 'near the Kaduwela junction'],
  ])('accepts %s', (input, expected) => {
    const { parsed: next } = adoptAnswer(base(), ['address'], input);
    expect(next.address).toBe(expected);
  });

  it('does not adopt when we never asked for an address', () => {
    const { parsed: next, adopted } = adoptAnswer(base(), ['rentPerMonth'], 'some text');
    expect(adopted).toEqual([]);
    expect(next.address).toBeNull();
  });

  it('does not overwrite an address the parser already found', () => {
    const parsed = base({ address: '42 Temple Road' });
    const { parsed: next } = adoptAnswer(parsed, ['address'], 'somewhere else');
    expect(next.address).toBe('42 Temple Road');
  });

  it('a bare town answering "address and town" is not stored as the address', () => {
    // Otherwise the listing reads "Horana, Horana".
    const parsed = base({ city: 'Horana', district: 'Kalutara' });
    const { adopted } = adoptAnswer(parsed, ['address', 'city'], 'Horana');
    expect(adopted).toEqual([]);
  });

  it.each(['25000', 'YES', 'DELETE', 'ok', '   '])('never adopts %s', (reply) => {
    const { adopted } = adoptAnswer(base(), ['address'], reply);
    expect(adopted).toEqual([]);
  });

  it('refuses an essay — that is a new ad, not an address', () => {
    const { adopted } = adoptAnswer(base(), ['address'], 'x'.repeat(200));
    expect(adopted).toEqual([]);
  });

  it('picks the labelled line out of a multi-line reply', () => {
    const { parsed: next } = adoptAnswer(
      base(),
      ['address'],
      'thanks for helping\nලිපිනය- පාර අයිනේ\nකාමර 2'
    );
    expect(next.address).toBe('පාර අයිනේ');
  });
});

describe('pending answers and the round cap', () => {
  it('accumulates every message sent since the last question', () => {
    // Landlords send three short lines in a row; all of them are the answer.
    expect(appendPendingAnswer(null, 'first')).toBe('first');
    expect(appendPendingAnswer('first', 'second')).toBe('first\nsecond');
    expect(appendPendingAnswer(null, null)).toBeNull();
  });

  it('caps the conversation before it can become a loop', () => {
    // Three identical asks is the bug. Two is a conversation.
    expect(NEEDS_INFO_MAX_ROUNDS).toBe(2);
  });
});

describe('parseStoredPayload', () => {
  it('reads back what a previous run stored', () => {
    const stored = JSON.stringify(base({ bedrooms: 3 }));
    expect(parseStoredPayload(stored)?.bedrooms).toBe(3);
  });

  it.each([null, undefined, '', 'not json', '"a string"', '42'])(
    'treats %s as no prior knowledge rather than throwing',
    (input) => {
      expect(parseStoredPayload(input as string | null)).toBeNull();
    }
  );
});

describe('our own keywords are never stored as listing data', () => {
  // "ඔව්" was adopted as an address in an early version of this module. The
  // word list lives in command-words.ts precisely so this check and the
  // conversation layer can never disagree about what a keyword is.
  it.each(['ඔව්', 'හරි', 'ஆம்', 'சரி', 'මකන්න', 'அழி', 'අවලංගු', 'ரத்து', 'උදව්', 'உதவி'])(
    'refuses %s',
    (reply) => {
      const { adopted } = adoptAnswer(base(), ['address'], reply);
      expect(adopted).toEqual([]);
    }
  );

  it('still accepts an address that merely CONTAINS a keyword', () => {
    const { parsed: next } = adoptAnswer(base(), ['address'], 'No. 12, Help Street, Kandy');
    expect(next.address).toBe('No. 12, Help Street, Kandy');
  });
});
