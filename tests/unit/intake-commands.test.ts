import { describe, expect, it } from 'vitest';
import {
  detectCommand,
  isCancel,
  isDeleteConfirmation,
  parseMenuPick,
} from '@/lib/intake/commands';

/**
 * These guards stand between a landlord's typing and an archived listing, so
 * they are pinned hard. The bias is deliberate: under-trigger rather than
 * over-trigger — a missed command falls through to the edit-link path, which is
 * harmless, while a false positive removes a live listing.
 */

describe('detectCommand — recognised commands', () => {
  const cases: Array<[string, ReturnType<typeof detectCommand>]> = [
    ['delete', 'delete'],
    ['DELETE', 'delete'],
    ['  delete  ', 'delete'],
    ['delete.', 'delete'],
    ['remove', 'delete'],
    ['unlist', 'delete'],
    ['take down', 'delete'],
    ['delete my listing', 'delete'],
    ['මකන්න', 'delete'],
    ['நீக்கு', 'delete'],
    ['link', 'link'],
    ['LINKS', 'link'],
    ['my link', 'link'],
    ['edit link', 'link'],
    ['login', 'link'],
    ['help', 'help'],
    ['menu', 'help'],
    ['?', 'help'],
    ['උදව්', 'help'],
  ];
  for (const [text, expected] of cases) {
    it(`"${text}" → ${expected}`, () => {
      expect(detectCommand(text)).toBe(expected);
    });
  }
});

describe('detectCommand — must NOT fire on listing content', () => {
  const notCommands = [
    // A real submission that happens to contain an edit verb.
    'remove 2 rooms, 45000 per month, Nugegoda',
    '3 bedroom house at 25 Galle Road, Dehiwala for 85000 per month',
    'please delete the last photo and change the rent to 95000',
    'Can you remove the second picture?',
    'House for rent. 220/A, Mackwatte, Asgiriya Gampaha. 2BR 20000 per month',
    // Long text is never a command even without digits.
    'delete this listing because the tenant has already moved in and we no longer need it',
    'thank you very much',
    '',
    null,
    undefined,
  ];
  for (const text of notCommands) {
    it(`"${String(text).slice(0, 45)}" → null`, () => {
      expect(detectCommand(text)).toBeNull();
    });
  }

  it('rejects anything containing a 4-digit number (a rent or an address)', () => {
    expect(detectCommand('delete 1234')).toBeNull();
  });

  it('rejects messages longer than a command could plausibly be', () => {
    expect(detectCommand('delete '.repeat(10))).toBeNull();
  });
});

describe('isDeleteConfirmation — the word that actually destroys', () => {
  it('accepts only the exact word', () => {
    expect(isDeleteConfirmation('DELETE')).toBe(true);
    expect(isDeleteConfirmation('delete')).toBe(true);
    expect(isDeleteConfirmation(' Delete ')).toBe(true);
    expect(isDeleteConfirmation('delete.')).toBe(true);
  });

  it('rejects everything else, so ambiguity cancels instead of deleting', () => {
    for (const t of ['yes', 'ok', 'confirm', 'delete it', 'delete listing 2', 'y', '1', '', null]) {
      expect(isDeleteConfirmation(t as string)).toBe(false);
    }
  });
});

describe('isCancel', () => {
  it('recognises the usual ways of backing out', () => {
    for (const t of ['cancel', 'STOP', 'no', 'never mind', 'nevermind', 'අවලංගු', 'ரத்து']) {
      expect(isCancel(t)).toBe(true);
    }
  });

  it('does not treat a menu pick or a confirmation as a cancel', () => {
    for (const t of ['1', 'delete', 'yes please']) {
      expect(isCancel(t)).toBe(false);
    }
  });
});

describe('parseMenuPick', () => {
  it('accepts single digits 1-9, with common punctuation', () => {
    expect(parseMenuPick('1')).toBe(1);
    expect(parseMenuPick(' 3 ')).toBe(3);
    expect(parseMenuPick('9.')).toBe(9);
    expect(parseMenuPick('2)')).toBe(2);
  });

  it('rejects 0, multi-digit, and anything else', () => {
    for (const t of ['0', '10', '12', 'one', 'first', '1 2', '', null]) {
      expect(parseMenuPick(t as string)).toBeNull();
    }
  });
});
