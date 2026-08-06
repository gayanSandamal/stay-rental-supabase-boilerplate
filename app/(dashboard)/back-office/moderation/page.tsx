import Link from 'next/link';
import Image from 'next/image';
import { and, count, desc, eq, inArray, lt } from 'drizzle-orm';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import { db } from '@/lib/db/drizzle';
import { listings } from '@/lib/db/schema';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldCheck, ExternalLink, AlertTriangle } from 'lucide-react';
import { parseManifest, parsePhotos } from '@/lib/images/manifest';
import { ModerationActions, RestorePhotoButton } from './moderation-actions';

export const dynamic = 'force-dynamic';

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-sky-100 text-sky-800',
  running: 'bg-indigo-100 text-indigo-800',
  passed: 'bg-emerald-100 text-emerald-800',
  held: 'bg-rose-100 text-rose-800',
  error: 'bg-amber-100 text-amber-800',
  skipped: 'bg-slate-200 text-slate-700',
};

/**
 * Ops queue for the automated approval engine. Shows ORIGINAL photos (never the
 * watermarked derivatives) with each one's verdict, so a false positive can be
 * seen and reversed.
 */
export default async function ModerationQueuePage() {
  await requireBackOfficeAccess();

  const rows = await db.query.listings.findMany({
    where: inArray(listings.moderationStatus, ['queued', 'running', 'held', 'error']),
    orderBy: [desc(listings.moderatedAt), desc(listings.createdAt)],
    limit: 100,
  });

  const recentlyPassed = await db.query.listings.findMany({
    where: inArray(listings.moderationStatus, ['passed']),
    orderBy: [desc(listings.moderatedAt)],
    limit: 15,
  });

  /**
   * NEVER CHECKED. `moderation_status` defaults to 'skipped' and the sweeper
   * only claims 'queued', so a listing nobody enqueued is never looked at — and
   * because this page used to list only queued/running/held/error, that was
   * invisible to ops as well. Four production listings went public that way.
   */
  const neverChecked = await db.query.listings.findMany({
    where: and(
      eq(listings.moderationStatus, 'skipped'),
      inArray(listings.status, ['active', 'pending'])
    ),
    orderBy: [desc(listings.createdAt)],
    limit: 50,
  });

  // Queued for more than half an hour means the sweeper is not draining. This
  // is INDEPENDENT of the never-checked count — a listing nobody enqueued and a
  // queue nobody is draining are different failures with different fixes, and
  // hiding one behind the other loses the signal.
  const stuckSince = new Date(Date.now() - 30 * 60 * 1000);
  const coverage = await db
    .select({ status: listings.moderationStatus, n: count() })
    .from(listings)
    .groupBy(listings.moderationStatus);
  const stuck = await db
    .select({ n: count() })
    .from(listings)
    .where(and(eq(listings.moderationStatus, 'queued'), lt(listings.updatedAt, stuckSince)))
    .then((r) => r[0]?.n ?? 0);

  const renderCard = (listing: (typeof rows)[number]) => {
    const manifest = parseManifest(listing.photosManifest);
    const rejected = manifest.filter((e) => e.v === 'reject');
    // An I2 violation (a photo no manifest entry accounts for) is a bug worth
    // seeing rather than a number worth hiding.
    const publicCount = parsePhotos(listing.photos).length;
    const covered = manifest.length;

    return (
      <Card key={listing.id} className="mb-4">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                STATUS_STYLES[listing.moderationStatus] ?? 'bg-slate-100 text-slate-700'
              }`}
            >
              {listing.moderationStatus.replace('_', ' ')}
            </span>
            {listing.moderationLanguage && (
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                {listing.moderationLanguage}
              </span>
            )}
            <Link
              href={`/dashboard/listings/${listing.id}`}
              className="inline-flex items-center gap-1 font-semibold text-slate-900 hover:underline"
            >
              {listing.title}
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
            <span className="text-sm text-slate-500">
              #{listing.id} · {listing.city} · attempt {listing.moderationAttempts}
            </span>
            <span
              className={`rounded px-2 py-0.5 text-xs ${
                publicCount > covered ? 'bg-amber-100 text-amber-900' : 'text-slate-500'
              }`}
              title="public photos vs manifest entries"
            >
              {publicCount} public / {covered} tracked
              {publicCount > covered ? ' — uncovered!' : ''}
            </span>
          </div>

          {listing.moderationSummary && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>{listing.moderationSummary}</span>
            </p>
          )}

          {manifest.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3">
              {manifest.map((entry) => (
                <div key={entry.o} className="w-40">
                  <div className="relative h-24 w-40 overflow-hidden rounded-lg bg-slate-100">
                    <Image
                      src={entry.o}
                      alt=""
                      fill
                      className={`object-cover ${entry.v === 'reject' ? 'opacity-40' : ''}`}
                      sizes="160px"
                      unoptimized
                    />
                    <span
                      className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        entry.v === 'reject'
                          ? 'bg-rose-600 text-white'
                          : entry.v === 'pass'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-600 text-white'
                      }`}
                    >
                      {entry.v}
                    </span>
                  </div>
                  {entry.r && <p className="mt-1 text-xs text-slate-600">{entry.r}</p>}
                  {entry.v === 'reject' && (
                    <div className="mt-1">
                      <RestorePhotoButton listingId={listing.id} originalUrl={entry.o} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-4">
            <ModerationActions
              listingId={listing.id}
              canPublish={listing.moderationStatus !== 'passed'}
            />
          </div>

          {rejected.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              Restoring a photo is remembered permanently — the same image will pass on every future
              check.
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-6 flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-teal-700" />
        <h1 className="text-2xl font-bold text-slate-900">Moderation</h1>
      </div>

      {/* Coverage first: the failure that matters most is a listing the engine
          never looked at, which by definition never appears in a queue. */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 text-sm">
            {coverage.map((c) => (
              <span key={c.status} className="flex items-center gap-1.5">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    STATUS_STYLES[c.status] ?? 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {c.status}
                </span>
                <span className="font-semibold text-slate-900">{c.n}</span>
              </span>
            ))}
          </div>
          {neverChecked.length > 0 && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <strong>{neverChecked.length} live or pending listing(s) have never been
              checked.</strong>{' '}
              They were created before anything enqueued them. Re-queue each one below.
            </p>
          )}
          {stuck > 0 && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">
              <strong>{stuck} listing(s) have been queued for over 30 minutes.</strong> The sweeper
              may not be running — check the cron and{' '}
              <code>GET /api/cron/moderate-listings</code>&apos;s <code>imageToolchain</code>.
            </p>
          )}
        </CardContent>
      </Card>

      {neverChecked.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Never checked</h2>
          {neverChecked.map(renderCard)}
        </div>
      )}

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            Nothing needs attention. Listings appear here when the automated checks hold them, or
            while they are queued.
          </CardContent>
        </Card>
      ) : (
        rows.map(renderCard)
      )}

      {recentlyPassed.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 text-lg font-semibold text-slate-900">Recently passed</h2>
          {recentlyPassed.map(renderCard)}
        </>
      )}
    </section>
  );
}
