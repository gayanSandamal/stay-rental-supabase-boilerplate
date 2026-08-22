import { describe, expect, it } from 'vitest';
import { detectCommand, isAffirmative, isCancel } from '@/lib/intake/commands';
import { socialConsentButtons, socialConsentPrompt } from '@/lib/intake/messages';

/**
 * The consent prompt is the one pending conversation state that is allowed to
 * FALL THROUGH (see the confirm_social block in lib/intake/session.ts).
 *
 * Every other pending state returns unconditionally once it matches, which is
 * correct for a delete or a town pick — those are mid-task, and any reply
 * belongs to them. The consent question is different: it is unsolicited, it
 * arrives seconds after "your listing is live", and it stays open for 24h.
 * Returning on anything but yes/no would swallow DELETE, HELP and LINK for that
 * whole window and break the promise deleteDoneMessage makes to every landlord.
 *
 * These tests pin the classifier that decision rests on.
 */

describe('isAffirmative', () => {
  const yes = [
    'yes',
    'YES',
    'Yes.',
    '  yeah ',
    'yep',
    'ok',
    'okay',
    'sure',
    'go ahead',
    'do it',
    'post it',
    'share it',
    'ඔව්',
    'හරි',
    'ஆம்',
    'சரி',
  ];
  it.each(yes)('accepts %j', (text) => {
    expect(isAffirmative(text)).toBe(true);
  });

  const no = [
    'no',
    'cancel',
    'stop',
    'delete',
    'help',
    'yes please share it on facebook and instagram and also',
    '3 bedroom house in Kandy 45000',
    '',
    'maybe later',
  ];
  it.each(no)('rejects %j', (text) => {
    expect(isAffirmative(text)).toBe(false);
  });
});

/**
 * The fall-through contract, expressed as the classifier results the
 * confirm_social branch actually consults. A message that is neither a yes nor
 * a no must leave BOTH classifiers false so the branch drops the prompt and
 * lets detectCommand run.
 */
describe('confirm_social fall-through', () => {
  const commandsThatMustSurvive = ['delete', 'DELETE', 'remove', 'help', 'link', 'restore'];

  it.each(commandsThatMustSurvive)(
    '%j is not read as a consent answer, so it reaches detectCommand',
    (text) => {
      expect(isAffirmative(text)).toBe(false);
      // `delete` is not a cancel word either — it must not be mistaken for "no".
      if (text.toLowerCase() !== 'no') {
        expect(detectCommand(text)).not.toBeNull();
      }
    }
  );

  it('treats a real submission as neither yes nor no', () => {
    const submission = 'Annex in Maharagama, 3 rooms, 45000 per month, water and generator';
    expect(isAffirmative(submission)).toBe(false);
    expect(isCancel(submission)).toBe(false);
    expect(detectCommand(submission)).toBeNull();
  });

  it('reads a plain no as a decline', () => {
    expect(isCancel('no')).toBe(true);
    expect(isCancel('No thanks')).toBe(false); // not an exact match — falls through, stays a decline by silence
    expect(isCancel('stop')).toBe(true);
  });
});

describe('consent prompt copy', () => {
  const prompt = socialConsentPrompt('Bright 3-bed house in Nugegoda');

  it('names the listing so a landlord with several knows which one', () => {
    expect(prompt).toContain('Bright 3-bed house in Nugegoda');
  });

  it('names the actual networks — "our social media" is not informed consent', () => {
    expect(prompt).toMatch(/Facebook/i);
    expect(prompt).toMatch(/Instagram/i);
    expect(prompt).toMatch(/TikTok/i);
  });

  it('states the privacy guarantee the caption builder enforces', () => {
    expect(prompt).toMatch(/phone number is never included/i);
  });

  it('works without buttons, because rich replies default OFF', () => {
    expect(prompt).toMatch(/reply YES/i);
    expect(prompt).toMatch(/NO/);
  });
});

describe('consent buttons', () => {
  const buttons = socialConsentButtons(42);

  it('binds each button to the listing, so a stale tap cannot answer for another', () => {
    expect(buttons.map((b) => b.id)).toEqual(['social_yes:42', 'social_no:42']);
  });

  it('fits the Cloud API 3-button / 20-char limits', () => {
    expect(buttons.length).toBeLessThanOrEqual(3);
    for (const button of buttons) {
      expect([...button.title].length).toBeLessThanOrEqual(20);
    }
  });
});
