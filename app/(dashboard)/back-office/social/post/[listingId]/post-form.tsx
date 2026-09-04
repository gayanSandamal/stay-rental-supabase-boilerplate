'use client';

import { useState, useTransition } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { postToTikTokAction } from './actions';

/**
 * The privacy choice and the Post button.
 *
 * Client-side only because two of TikTok's Direct Post rules need live state:
 * the privacy level must be an EXPLICIT choice (so nothing is pre-selected, and
 * Post stays disabled until one is picked), and the operator must not be able
 * to fire a second post while the first is in flight — a TikTok publish polls
 * for up to 30s, which is ample time for an impatient second click.
 */

/** TikTok's own labels, so the screen reads the way the app does. */
const PRIVACY_LABELS: Record<string, { label: string; hint: string }> = {
  PUBLIC_TO_EVERYONE: { label: 'Public', hint: 'Anyone on TikTok can see this post' },
  MUTUAL_FOLLOW_FRIENDS: { label: 'Friends', hint: 'Accounts that follow each other' },
  FOLLOWER_OF_CREATOR: { label: 'Followers', hint: 'Accounts that follow this one' },
  SELF_ONLY: { label: 'Private (only me)', hint: 'Visible only to the account owner' },
};

export function PostForm({
  listingId,
  privacyOptions,
  disabledReason,
}: {
  listingId: number;
  /** Exactly what TikTok said this account may choose — never a hardcoded list. */
  privacyOptions: string[];
  /** Non-null when posting is impossible; the button is replaced by the reason. */
  disabledReason?: string | null;
}) {
  const [privacy, setPrivacy] = useState('');
  const [pending, start] = useTransition();

  if (disabledReason) {
    return (
      <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        {disabledReason}
      </p>
    );
  }

  if (!privacyOptions.length) {
    return (
      <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">
        TikTok returned no available privacy levels for this account, so there is nothing that
        can legally be posted. Reconnect the account and try again.
      </p>
    );
  }

  return (
    <form
      action={(fd) => {
        fd.set('listingId', String(listingId));
        fd.set('privacyLevel', privacy);
        start(() => postToTikTokAction(fd));
      }}
      className="space-y-4"
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-slate-900">
          Who can see this post?
          <span className="ml-1 font-normal text-rose-600">required</span>
        </legend>
        {/* Nothing is pre-selected on purpose — TikTok requires the creator to
            choose, and a sensible-looking default IS the app choosing. */}
        {privacyOptions.map((option) => {
          const meta = PRIVACY_LABELS[option] ?? { label: option, hint: '' };
          return (
            <label
              key={option}
              className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                privacy === option
                  ? 'border-teal-500 bg-teal-50'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="privacyChoice"
                value={option}
                checked={privacy === option}
                onChange={() => setPrivacy(option)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-slate-900">{meta.label}</span>
                {meta.hint && <span className="block text-xs text-slate-500">{meta.hint}</span>}
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!privacy || pending}>
          {pending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-1.5 h-4 w-4" />
          )}
          {pending ? 'Posting to TikTok…' : 'Post to TikTok'}
        </Button>
        {!privacy && (
          <span className="text-xs text-slate-500">Choose who can see it first.</span>
        )}
      </div>

      {pending && (
        /* The adapter polls TikTok to a terminal state rather than firing and
           hoping, so this genuinely can take half a minute. Saying so stops the
           operator reloading mid-publish. */
        <p className="text-xs text-slate-500">
          TikTok is fetching the photos from our server. This usually takes a few seconds but can
          take up to 30 — don’t reload.
        </p>
      )}
    </form>
  );
}
