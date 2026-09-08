import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { ArrowLeft, ExternalLink, FileWarning } from 'lucide-react';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import { db } from '@/lib/db/drizzle';
import { postImports } from '@/lib/db/schema';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { PageHeader } from '@/components/back-office/page-header';
import { StatusBadge } from '@/components/ui/badge';
import { extractPhoneNumbers } from '@/lib/moderation/contact-scrub';
import { parsePayload, parsePhotoUrls } from '@/lib/imports/publish';
import { ReviewForm } from './review-form';

export const revalidate = 30;
export const maxDuration = 60;

/** Redirect codes → a banner. There is no toast library in this codebase. */
const RESULTS: Record<string, { ok: boolean; title: string; detail: string }> = {
  saved: { ok: true, title: 'Draft saved', detail: 'Nothing is public yet.' },
  extracted: {
    ok: true,
    title: 'Re-read the post text',
    detail: 'Check the fields below — anything you had typed by hand was kept.',
  },
  'published-sent': {
    ok: true,
    title: 'Published, and the owner was messaged',
    detail: 'They have a link to edit or remove it themselves.',
  },
  'published-dry_run': {
    ok: true,
    title: 'Published — the owner was NOT messaged',
    detail:
      'Either owner notifications are switched off or no approved WhatsApp template is registered. The message was composed and logged, not sent.',
  },
  'published-failed': {
    ok: false,
    title: 'Published, but WhatsApp rejected the message',
    detail:
      'The listing is live and the owner does not know. Check the number and contact them another way.',
  },
  no_text: {
    ok: false,
    title: 'Nothing to read',
    detail: 'Paste the post text into the box before re-reading it.',
  },
  incomplete: {
    ok: false,
    title: 'Not enough to publish',
    detail:
      'Title, city, bedrooms, monthly rent and the owner’s phone number are all required.',
  },
  publish_failed: {
    ok: false,
    title: 'Publishing failed',
    detail: 'Nothing was published. Try again; if it repeats, check the server logs.',
  },
};

export default async function ImportReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; extracted?: string; published?: string }>;
}) {
  await requireBackOfficeAccess();
  const flags = await loadFeatureFlags();
  if (!flags.enableFacebookImport) notFound();

  const { id } = await params;
  const importId = Number(id);
  if (!Number.isFinite(importId) || importId <= 0) notFound();

  const record = await db.query.postImports.findFirst({
    where: eq(postImports.id, importId),
  });
  if (!record) notFound();

  const query = await searchParams;
  const resultKey = query.published
    ? `published-${query.published}`
    : query.error ?? (query.saved ? 'saved' : query.extracted ? 'extracted' : null);
  const result = resultKey ? RESULTS[resultKey] : null;

  const parsed = parsePayload(record.parsedPayload);
  const photos = parsePhotoUrls(record.photoUrls);

  // Recomputed from the current text rather than stored: the operator may have
  // pasted the post since the draft was created, and the number they need to
  // confirm is the one in front of them now.
  const phoneCandidates = extractPhoneNumbers(record.rawText);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <Link
        href="/back-office/imports"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Imports
      </Link>

      <PageHeader
        icon={FileWarning}
        title={parsed.title ?? `Import #${record.id}`}
        summary={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={record.status} />
            <a
              href={record.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 hover:underline"
            >
              Original post <ExternalLink className="h-3 w-3" />
            </a>
            {record.listingId && (
              <Link
                href={`/dashboard/listings/${record.listingId}`}
                className="text-teal-700 hover:underline"
              >
                Listing #{record.listingId}
              </Link>
            )}
          </span>
        }
      />

      {result && (
        <section
          role="status"
          className={`mb-4 rounded-md border px-3 py-2 text-sm ${
            result.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-rose-300 bg-rose-50 text-rose-900'
          }`}
        >
          <p className="font-semibold">{result.title}</p>
          <p>{result.detail}</p>
        </section>
      )}

      <ReviewForm
        importId={record.id}
        status={record.status}
        resolvedVia={record.resolvedVia}
        sourcePlatform={record.sourcePlatform}
        rawText={record.rawText ?? ''}
        parsed={{
          title: parsed.title,
          description: parsed.description,
          propertyType: parsed.propertyType,
          address: parsed.address,
          city: parsed.city,
          district: parsed.district,
          bedrooms: parsed.bedrooms,
          bathrooms: parsed.bathrooms,
          rentPerMonth: parsed.rentPerMonth,
        }}
        photos={photos}
        ownerName={record.ownerName}
        ownerPhone={record.ownerPhone}
        phoneCandidates={phoneCandidates}
      />
    </section>
  );
}
