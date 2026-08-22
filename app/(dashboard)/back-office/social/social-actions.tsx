'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Copy, RefreshCw, Trash2 } from 'lucide-react';
import { markGroupPostedAction, pullDownAction, retryAction } from './actions';

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
