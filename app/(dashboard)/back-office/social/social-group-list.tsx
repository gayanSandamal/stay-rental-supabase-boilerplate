'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { DetailDrawer } from '@/components/back-office/detail-drawer';
import { useListKeys } from '@/components/back-office/use-list-keys';
import { fullTimestamp } from '@/lib/back-office/format';
import { cn } from '@/lib/utils';
import { ListingSocialActions, SocialActions } from './social-actions';

const PLATFORM_LABELS: Record<string, string> = {
  facebook_page: 'Facebook Page',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook_group: 'Facebook Group',
};

export type SocialPostView = {
  id: number;
  platform: string;
  status: string;
  remotePermalink: string | null;
  remotePostId: string | null;
  caption: string | null;
  attempts: number;
  error: string | null;
  postedAt: string | null;
  supportsRemove: boolean;
  dryRun: boolean;
};

export type SocialGroupView = {
  listingId: number;
  title: string | null;
  listingStatus: string | null;
  summary: string;
  failed: number;
  live: number;
  captions: Array<{ caption: string; platforms: string[] }>;
  posts: SocialPostView[];
};

/**
 * One ROW per listing, expandable to its platforms.
 *
 * Four cards for one listing was the reason this page was unreadable; four
 * fully-expanded captions per listing was the reason it was endless. Captions
 * now live in the drawer only.
 */
export function SocialGroupList({ groups }: { groups: SocialGroupView[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleExpanded = (listingId: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(listingId)) next.delete(listingId);
      else next.add(listingId);
      return next;
    });

  const { cursor, setCursor } = useListKeys({
    items: groups,
    onOpen: (i) => setOpenIndex(i),
    onToggleSelect: (i) => toggleExpanded(groups[i].listingId),
  });

  const open = openIndex === null ? null : groups[openIndex];

  return (
    <>
      <ul className="divide-y divide-slate-200">
        {groups.map((group, index) => {
          const isExpanded = expanded.has(group.listingId);
          return (
            <li
              key={group.listingId}
              className={cn(cursor === index && 'ring-2 ring-inset ring-teal-600/40')}
            >
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 hover:bg-slate-50">
                <button
                  type="button"
                  onClick={() => toggleExpanded(group.listingId)}
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} platforms for listing ${group.listingId}`}
                  className="rounded p-0.5 text-slate-500 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCursor(index);
                    setOpenIndex(index);
                  }}
                  className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-slate-900 hover:underline"
                >
                  {group.title ?? `Listing #${group.listingId}`}
                </button>

                <Link
                  href={`/dashboard/listings/${group.listingId}`}
                  className="shrink-0 font-mono text-xs text-teal-700 hover:underline"
                >
                  #{group.listingId}
                </Link>

                {group.listingStatus && group.listingStatus !== 'active' && (
                  <Badge variant="danger">listing {group.listingStatus}</Badge>
                )}

                {/* Platform pills at a glance, so the row answers "what
                    happened to this listing" without expanding. */}
                <div className="flex flex-wrap items-center gap-1">
                  {group.posts.map((post) => (
                    <Badge
                      key={post.id}
                      variant={post.dryRun ? 'warn' : undefined}
                      className="min-w-0"
                      title={`${PLATFORM_LABELS[post.platform] ?? post.platform} — ${post.dryRun ? 'dry run' : post.status}`}
                    >
                      {(PLATFORM_LABELS[post.platform] ?? post.platform).split(' ')[0]}
                      <span className="opacity-60">
                        {post.dryRun ? 'dry' : post.status}
                      </span>
                    </Badge>
                  ))}
                </div>

                <span className="ml-auto shrink-0 text-xs text-slate-500 tabular-nums">
                  {group.summary}
                </span>
              </div>

              {isExpanded && (
                <div className="divide-y divide-slate-100 bg-slate-50/60 px-3 pb-2">
                  {group.posts.map((post) => (
                    <div key={post.id} className="flex flex-wrap items-center gap-2 py-2">
                      <span className="min-w-[7.5rem] rounded bg-white px-2 py-0.5 text-xs font-medium text-slate-700">
                        {PLATFORM_LABELS[post.platform] ?? post.platform}
                      </span>
                      <StatusBadge status={post.status} />
                      {/* A dry run reports success without having sent
                          anything. It gets its own badge and no takedown, or
                          the row is the same lie as a phantom deletion. */}
                      {post.dryRun && <Badge variant="warn">dry run — nothing was sent</Badge>}
                      {post.remotePermalink && (
                        <a
                          href={post.remotePermalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-teal-700 hover:underline"
                        >
                          View post <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {post.postedAt && (
                        <span className="text-xs text-slate-500">
                          {fullTimestamp(post.postedAt)}
                        </span>
                      )}
                      {post.attempts > 0 && (
                        <span className="text-xs text-slate-500 tabular-nums">
                          {post.attempts} attempt(s)
                        </span>
                      )}
                      {post.error && (
                        <span
                          className={cn(
                            'font-mono text-[11px]',
                            post.error.includes('REMOVE BY HAND')
                              ? 'font-semibold text-rose-700'
                              : 'text-slate-500'
                          )}
                        >
                          {post.error}
                        </span>
                      )}
                      <span className="ml-auto">
                        <SocialActions
                          postId={post.id}
                          status={post.status}
                          platform={post.platform}
                          caption={post.caption}
                          supportsRemove={post.supportsRemove}
                          dryRun={post.dryRun}
                        />
                      </span>
                    </div>
                  ))}
                  <div className="pt-2">
                    <ListingSocialActions
                      listingId={group.listingId}
                      failedCount={group.failed}
                      livePostCount={group.live}
                    />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <DetailDrawer
        open={open !== null}
        onOpenChange={(next) => !next && setOpenIndex(null)}
        title={open ? (open.title ?? `Listing #${open.listingId}`) : ''}
        subtitle={open ? `#${open.listingId} · ${open.summary}` : undefined}
        footer={
          open ? (
            <ListingSocialActions
              listingId={open.listingId}
              failedCount={open.failed}
              livePostCount={open.live}
            />
          ) : null
        }
      >
        {open && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {open.listingStatus && (
                <Badge variant={open.listingStatus === 'active' ? 'ok' : 'danger'}>
                  listing {open.listingStatus}
                </Badge>
              )}
            </div>

            {/* Captions are per-platform shaped (Instagram says "link in bio",
                TikTok caps the title), so they are not always equal — but they
                usually are. Render each DISTINCT caption once, labelled with
                the platforms that share it. */}
            <div>
              <h3 className="mb-2 text-xs font-semibold text-slate-500">
                Captions — exactly what was sent
              </h3>
              {open.captions.length === 0 ? (
                <p className="text-sm text-slate-500">No caption recorded.</p>
              ) : (
                <div className="space-y-3">
                  {open.captions.map(({ caption, platforms }) => (
                    <div key={caption}>
                      <p className="mb-1 text-xs font-medium text-slate-500">
                        {platforms.map((pf) => PLATFORM_LABELS[pf] ?? pf).join(' · ')}
                      </p>
                      <pre className="max-h-64 overflow-y-auto rounded bg-slate-50 p-3 font-mono text-xs whitespace-pre-wrap text-slate-700">
                        {caption}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Link
              href={`/dashboard/listings/${open.listingId}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:underline"
            >
              Open listing #{open.listingId}
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </DetailDrawer>
    </>
  );
}
