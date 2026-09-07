'use client';

import { useTransition } from 'react';
import { Loader2, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createImportAction } from '../actions';

/**
 * Client-side only for the in-flight state: resolving hits Facebook and then
 * downloads every photo it found, which genuinely takes several seconds. A
 * button that looks idle for that long gets clicked twice, and twice means two
 * drafts of the same ad.
 */
export function ImportUrlForm() {
  const [pending, start] = useTransition();

  return (
    <form
      action={(formData) => start(() => createImportAction(formData))}
      className="space-y-3 rounded-md border border-slate-200 bg-white p-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="sourceUrl">Facebook post URL</Label>
        <Input
          id="sourceUrl"
          name="sourceUrl"
          type="url"
          required
          autoFocus
          placeholder="https://www.facebook.com/groups/…/posts/…"
          disabled={pending}
        />
        <p className="text-xs text-slate-500">
          The link to one post. Group posts, page posts and photo posts all work.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Link2 className="mr-1.5 h-4 w-4" />
          )}
          {pending ? 'Fetching…' : 'Fetch post'}
        </Button>
        {pending && (
          <span className="text-xs text-slate-500">
            Asking Facebook, then saving any photos. Don&rsquo;t reload.
          </span>
        )}
      </div>
    </form>
  );
}
