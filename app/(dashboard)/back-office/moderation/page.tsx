import Link from 'next/link';
import Image from 'next/image';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import { db } from '@/lib/db/drizzle';
import { listings } from '@/lib/db/schema';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldCheck, ExternalLink, AlertTriangle } from 'lucide-react';
import { adoptOrphanPhotos, parseManifest, parsePhotos } from '@/lib/images/manifest';
import { ModerationActions, QueueForChecksButton, RestorePhotoButton } from './moderation-actions';

export const dynamic = 'force-dynamic';

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-sky-100 text-sky-800',
  running: 'bg-indigo-100 text-indigo-800',
  passed: 'bg-emerald-100 text-emerald-800',
  held: 'bg-rose-100 text-rose-800',
  error: 'bg-amber-100 text-amber-800',
  skipped: 'bg-slate-200 text-slate-700',
};

/** Per-photo verdict badge. `queued` and `skipped` are the interesting ones. */
const VERDICT_STYLES: Record<string, string> = {
  pass: 'bg-emerald-600 text-white',
  reject: 'bg-rose-600 text-white',
  queued: 'bg-sky-600 text-white',
  skipped: 'bg-amber-600 text-white',
};

/** Every enum value, so a status with zero rows still shows its zero. */
const ALL_STATUSES = ['queued', 'running', 'passed', 'held', 'error', 'skipped'] as const;

/** A queued row older than this has no checker running — treat it as a miss. */
const STALE_QUEUE_MINUTES = 30;

/**
 * Ops queue for the automated approval engine. Shows ORIGINAL photos (never the
 * watermarked derivatives) with each one's verdict, so a false positive can be
 * seen and reversed.
 *
 * The coverage panel exists because the failure that hurt was silent: rows the
 * sweeper can never claim (`skipped`) and rows nothing is claiming (`queued`,
 * stale) used to be invisible here. Coverage misses are now a number on screen.
 */
export default async function ModerationQueuePage() {
  await requireBackOfficeAccess();

  const coverage = await db
    .select({
      status: listings.moderationStatus,
      total: sql<number>`count(*)`,
      stale: sql<number>`count(*) filter (where ${listings.updatedAt} < now() - ${sql.raw(
        `interval '${STALE_QUEUE_MINUTES} minutes'`
      )})`,
    })
    .from(listings)
    .groupBy(listings.moderationStatus);

  const counts = new Map(
    coverage.map((row) => [row.status, { total: Number(row.total), stale: Number(row.stale) }])
  );

  const rows = await db.query.listings.findMany({
    where: inArray(listings.moderationStatus, ['queued', 'running', 'held', 'error']),
    orderBy: [desc(listings.moderatedAt), desc(listings.createdAt)],
    limit: 100,
  });

  const neverChecked = await db.query.listings.findMany({
    where: eq(listings.moderationStatus, 'skipped'),
    orderBy: [desc(listings.createdAt)],
    limit: 50,
  });

  const recentlyPassed = await db.query.listings.findMany({
    where: inArray(listings.moderationStatus, ['passed']),
    orderBy: [desc(listings.moderatedAt)],
    limit: 15,
  });

  const renderCard = (
    listing: (typeof rows)[number],
    opts: { neverChecked?: boolean } = {}
  ) => {
    const tracked = parseManifest(listing.photosManifest);
    const photos = parsePhotos(listing.photos);
    // Adopted orphans are appended, so anything past `tracked` is live in the
    // gallery but was never covered by the manifest.
    const gallery = adoptOrphanPhotos(tracked, photos).entries;
    const untrackedCount = gallery.length - tracked.length;
    const rejected = tracked.filter((e) => e.v === 'reject');

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
          </div>

          <p className="mt-2 text-xs text-slate-500">
            {photos.length} published {photos.length === 1 ? 'photo' : 'photos'} ·{' '}
            {tracked.length} in manifest
            {untrackedCount > 0 && (
              <span className="ml-1 font-medium text-amber-700">
                · {untrackedCount} never tracked
              </span>
            )}
          </p>

          {listing.moderationSummary && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>{listing.moderationSummary}</span>
            </p>
          )}

          {gallery.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3">
              {gallery.map((entry, index) => {
                const untracked = index >= tracked.length;
                return (
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
                          untracked
                            ? 'bg-amber-600 text-white'
                            : (VERDICT_STYLES[entry.v] ?? 'bg-slate-600 text-white')
                        }`}
                      >
                        {untracked ? 'untracked' : entry.v}
                      </span>
                    </div>
                    {entry.r && <p className="mt-1 text-xs text-slate-600">{entry.r}</p>}
                    {entry.v === 'reject' && (
                      <div className="mt-1">
                        <RestorePhotoButton listingId={listing.id} originalUrl={entry.o} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4">
            {opts.neverChecked ? (
              <QueueForChecksButton listingId={listing.id} />
            ) : (
              <ModerationActions
                listingId={listing.id}
                canPublish={listing.moderationStatus !== 'passed'}
              />
            )}
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

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {ALL_STATUSES.map((status) => {
          const { total, stale } = counts.get(status) ?? { total: 0, stale: 0 };
          const neverCheckedWarning = status === 'skipped' && total > 0;
          const staleWarning = status === 'queued' && stale > 0;
          const warn = neverCheckedWarning || staleWarning;
          return (
            <Card key={status} className={warn ? 'border-amber-300 bg-amber-50' : undefined}>
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  {warn && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />}
                  {status}
                </div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{total}</div>
                {staleWarning && (
                  <p className="text-xs font-medium text-amber-700">
                    {stale} waiting over {STALE_QUEUE_MINUTES} min
                  </p>
                )}
                {neverCheckedWarning && (
                  <p className="text-xs font-medium text-amber-700">never checked</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            Nothing needs attention. Listings appear here when the automated checks hold them, or
            while they are queued.
          </CardContent>
        </Card>
      ) : (
        rows.map((listing) => renderCard(listing))
      )}

      {neverChecked.length > 0 && (
        <>
          <h2 className="mb-1 mt-10 text-lg font-semibold text-slate-900">Never checked</h2>
          <p className="mb-3 text-sm text-slate-500">
            The sweeper only claims queued rows, so these have never been through the checks. Queuing
            one is safe: photos already live stay live and are checked in place.
          </p>
          {neverChecked.map((listing) => renderCard(listing, { neverChecked: true }))}
        </>
      )}

      {recentlyPassed.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 text-lg font-semibold text-slate-900">Recently passed</h2>
          {recentlyPassed.map((listing) => renderCard(listing))}
        </>
      )}
    </section>
  );
}
