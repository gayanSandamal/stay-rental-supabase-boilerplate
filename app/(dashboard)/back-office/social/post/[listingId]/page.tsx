import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, XCircle } from 'lucide-react';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import { db } from '@/lib/db/drizzle';
import { listingSocialPosts } from '@/lib/db/schema';
import { getListingById } from '@/lib/db/queries';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { buildCaption, type CaptionListing } from '@/lib/social/caption';
import { socialImageUrls } from '@/lib/social/images';
import { baseUrl } from '@/lib/social/config';
import { getTikTokCreatorInfo } from '@/lib/social/adapters/tiktok';
import { isDryRunPost } from '@/lib/social/types';
import { PageHeader } from '@/components/back-office/page-header';
import { PostForm } from './post-form';

/**
 * Review a listing and post it to TikTok — the human-in-the-loop path.
 *
 * The cron sweeper is still the product: a landlord consents over WhatsApp and
 * the queue posts on its own. This screen exists because TikTok's Direct Post
 * rules ask for something the cron cannot provide — the creator seeing exactly
 * what goes out, choosing the privacy level themselves, and pressing the button.
 * Easy Rent owns the TikTok account, so the "creator" here is ops.
 *
 * Everything shown is the REAL payload: the same `buildCaption` and
 * `socialImageUrls` the worker calls, and privacy options straight from a live
 * `creator_info` query. A review screen that previewed anything other than what
 * will actually be sent would be worse than no review screen.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RESULTS: Record<string, { ok: boolean; title: string; detail: string }> = {
  posted: {
    ok: true,
    title: 'Posted to TikTok',
    detail: 'The post is live on the connected account. The link below opens it.',
  },
  privacy_required: {
    ok: false,
    title: 'Choose who can see the post',
    detail: 'TikTok requires the privacy level to be chosen deliberately. Nothing was sent.',
  },
  already_handled: {
    ok: false,
    title: 'Already posted, or being posted right now',
    detail:
      'This listing is either already on TikTok or is being published by the scheduled job. Nothing was sent, to avoid a duplicate.',
  },
  failed: {
    ok: false,
    title: 'TikTok rejected the post',
    detail: 'The reason is recorded against the listing below and in Back Office → Social.',
  },
};

export default async function PostToTikTokPage({
  params,
  searchParams,
}: {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<{ posted?: string; error?: string }>;
}) {
  await requireBackOfficeAccess();
  await loadFeatureFlags(true);

  const { listingId: rawId } = await params;
  const { posted, error } = await searchParams;
  const listingId = Number(rawId);
  if (!Number.isFinite(listingId) || listingId <= 0) notFound();

  const listing = await getListingById(listingId);
  if (!listing) notFound();

  const result = posted ? RESULTS.posted : error ? RESULTS[error] : null;

  // The exact payload the worker would build. Not a mock-up of it.
  const caption = buildCaption('tiktok', listing as unknown as CaptionListing, {
    baseUrl: baseUrl(),
  });
  const imageUrls = socialImageUrls(listing);

  const existing = await db.query.listingSocialPosts.findFirst({
    where: and(
      eq(listingSocialPosts.listingId, listingId),
      eq(listingSocialPosts.platform, 'tiktok')
    ),
  });

  // Live, so the options offered are the ones TikTok will accept a second later.
  const creator = await getTikTokCreatorInfo();

  /*
   * Every reason posting is impossible, resolved to ONE sentence for the form.
   * Ordered by what the operator must fix first — a disabled platform makes the
   * credential state irrelevant, and a non-active listing makes both irrelevant.
   */
  const disabledReason = !isFeatureEnabled('enableSocialAutoPublish')
    ? 'Social auto-publish is switched off in Settings, so nothing can be posted.'
    : !isFeatureEnabled('socialPublishTikTok')
      ? 'The “post to TikTok” switch is off in Settings. Turn it on to post.'
      : listing.status !== 'active'
        ? `This listing is ${listing.status}, not active. Only a live listing can be posted.`
        : !imageUrls.length
          ? 'This listing has no published photos, and a TikTok photo post needs at least one.'
          : existing?.status === 'posted'
            ? 'This listing has already been posted to TikTok. Pull it down first if you need to repost.'
            : !creator.ok
              ? creator.error
              : null;

  const info = creator.ok ? creator.info : null;
  const avatar = info?.avatarUrl ?? null;
  const accountLabel = info?.nickname ?? info?.username ?? 'the connected account';

  return (
    <section className="flex-1 p-4 lg:p-8">
      <Link
        href="/back-office/social"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Social
      </Link>

      <PageHeader
        icon={ExternalLink}
        title="Post to TikTok"
        summary={`${listing.title} · #${listing.id}`}
      />

      {result && (
        <section
          role="status"
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            result.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-rose-300 bg-rose-50 text-rose-900'
          }`}
        >
          <h2 className="flex items-center gap-2 font-semibold">
            {result.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0" />
            )}
            {result.title}
          </h2>
          <p className="mt-1 opacity-90">{result.detail}</p>
          {result.ok && existing?.remotePermalink && (
            <a
              href={existing.remotePermalink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 font-medium underline"
            >
              Open the post on TikTok <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {result.ok && existing && isDryRunPost(existing.remotePostId) && (
            /* Never let a dry run read as a real post — the same rule the ops
               list follows. Nothing was sent to TikTok at all. */
            <p className="mt-2 font-medium">
              DRY RUN — TikTok has no credentials configured here, so nothing was actually sent.
            </p>
          )}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          {/* WHAT is going out. */}
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Photos ({imageUrls.length})
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Served from our own verified domain and normalised to 1080×1350. TikTok pulls them
              from these URLs.
            </p>
            {imageUrls.length ? (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {imageUrls.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={url}
                    src={url}
                    alt={`Photo ${i + 1} of ${listing.title}`}
                    className="h-40 w-32 shrink-0 rounded border border-slate-200 object-cover"
                  />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-rose-700">No published photos on this listing.</p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Caption</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Exactly what will be sent. Never contains a phone number — enquiries go through the
              listing page.
            </p>
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 font-sans text-sm text-slate-800">
              {caption}
            </pre>
          </div>
        </div>

        {/* WHO it goes out as, and the decision. */}
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Posting as</h2>
            <div className="mt-3 flex items-center gap-3">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar}
                  alt=""
                  className="h-10 w-10 rounded-full border border-slate-200 object-cover"
                />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
                  {accountLabel.slice(0, 2).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{accountLabel}</p>
                {info?.username && (
                  <p className="truncate text-xs text-slate-500">@{info.username}</p>
                )}
              </div>
            </div>
            {!creator.ok && (
              <p className="mt-3 text-xs text-rose-700">{creator.error}</p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <PostForm
              listingId={listingId}
              privacyOptions={info?.privacyLevelOptions ?? []}
              disabledReason={disabledReason}
            />

            {info?.privacyLevelOptions.length === 1 &&
              info.privacyLevelOptions[0] === 'SELF_ONLY' && (
                <p className="mt-3 flex items-start gap-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    TikTok is offering <strong>only</strong> “private”. That is what an unaudited
                    app gets — the post will be visible to the account owner alone until the audit
                    clears.
                  </span>
                </p>
              )}

            {existing?.error && existing.status === 'failed' && (
              <p className="mt-3 rounded bg-rose-50 px-2 py-1.5 text-xs text-rose-800">
                Last attempt: {existing.error}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
