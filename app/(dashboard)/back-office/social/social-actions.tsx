'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Copy, RefreshCw, Trash2 } from 'lucide-react';
import {
  markGroupPostedAction,
  markManuallyRemovedAction,
  pullDownAction,
  pullDownListingAction,
  retryAction,
  retryAllFailedAction,
  retryListingFailedAction,
} from './actions';

/**
 * Card-level actions: everything for ONE listing, across every platform.
 *
 * A credential fault or an archived listing is never per-platform — it hits all
 * of them at once — so the fix should be one click, not four.
 */
export function ListingSocialActions({
  listingId,
  failedCount,
  livePostCount,
}: {
  listingId: number;
  failedCount: number;
  /** Real posts (dry runs excluded) that there is actually something to remove for. */
  livePostCount: number;
}) {
  const [pending, start] = useTransition();

  const run = (action: (fd: FormData) => Promise<void>) => () => {
    const fd = new FormData();
    fd.set('listingId', String(listingId));
    start(async () => {
      await action(fd);
    });
  };

  if (!failedCount && !livePostCount) return null;

  return (
    <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
      {failedCount > 0 && (
        <Button size="sm" variant="outline" disabled={pending} onClick={run(retryListingFailedAction)}>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Retry {failedCount} failed
        </Button>
      )}
      {livePostCount > 0 && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={run(pullDownListingAction)}
          className="border-rose-300 text-rose-800 hover:bg-rose-50"
          // Deliberately not "delete everywhere": only Facebook actually goes
          // through an API. The rest becomes a task for a human, and the banner
          // above this list says so.
          title="Delete the Facebook post and flag Instagram/TikTok for manual removal"
        >
          <Trash2 className="mr-1.5 h-4 w-4" />
          Pull down all
        </Button>
      )}
    </div>
  );
}

/**
 * Requeue every failed row at once.
 *
 * Rendered only when something is actually failed. The motivating case is a
 * credential fault: one expired Page token failed every queued post, and
 * clearing that by hand meant clicking Retry once per row.
 */
export function RetryAllFailed({ count }: { count: number }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await retryAllFailedAction();
        })
      }
    >
      <RefreshCw className="mr-1.5 h-4 w-4" />
      Retry all {count} failed
    </Button>
  );
}

export function SocialActions({
  postId,
  status,
  platform,
  caption,
  supportsRemove,
  dryRun,
}: {
  postId: number;
  status: string;
  platform: string;
  caption: string | null;
  supportsRemove: boolean;
  /** Nothing was actually sent — the adapter had no credentials. */
  dryRun: boolean;
}) {
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  const run = (action: (fd: FormData) => Promise<void>) => () => {
    const fd = new FormData();
    fd.set('postId', String(postId));
    start(async () => {
      await action(fd);
    });
  };

  const copy = () => {
    if (!caption) return;
    navigator.clipboard.writeText(caption).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setCopied(false)
    );
  };

  const isGroup = platform === 'facebook_group';

  return (
    <div className="flex flex-wrap gap-2">
      {caption && (
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
          {copied ? 'Copied' : 'Copy caption'}
        </Button>
      )}

      {/* The Group row is closed by a human, because only a human can post it. */}
      {isGroup && status === 'skipped' && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={run(markGroupPostedAction)}
          className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
        >
          <Check className="mr-1.5 h-4 w-4" />
          I posted it
        </Button>
      )}

      {status === 'failed' && (
        <Button size="sm" variant="outline" disabled={pending} onClick={run(retryAction)}>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Retry
        </Button>
      )}

      {/* No takedown on a dry run: there is nothing on any platform to remove,
          and offering the button is the same lie as claiming an Instagram
          deletion we cannot perform. */}
      {status === 'posted' && !dryRun && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={run(pullDownAction)}
          className="border-rose-300 text-rose-800 hover:bg-rose-50"
          // Say what the button will actually do. On Instagram and TikTok it
          // records the decision and hands the reviewer a link — it cannot
          // delete the post, and implying otherwise leaves it up.
          title={
            supportsRemove
              ? 'Delete this post from the platform'
              : 'This platform has no delete API — this marks it for manual removal'
          }
        >
          <Trash2 className="mr-1.5 h-4 w-4" />
          {supportsRemove ? 'Pull down' : 'Mark for removal'}
        </Button>
      )}
    </div>
  );
}


/**
 * "I deleted it" — the only thing that closes an outstanding manual takedown.
 *
 * Deliberately worded as a confirmation of something already done, not as an
 * instruction to the platform. Clicking it removes nothing; it records that a
 * human already opened the permalink and removed the post. Anyone who reads it
 * as a delete button would leave posts up while the worklist emptied, which is
 * the exact failure this list exists to catch.
 */
export function ConfirmManualTakedown({ postId }: { postId: number }) {
  const [pending, start] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        const fd = new FormData();
        fd.set('postId', String(postId));
        start(async () => {
          await markManuallyRemovedAction(fd);
        });
      }}
      title="Record that you have already deleted this post on the platform"
    >
      <Check className="mr-1.5 h-4 w-4" />
      I&rsquo;ve removed it
    </Button>
  );
}
