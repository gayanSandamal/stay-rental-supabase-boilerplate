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
import { detectSaleAd } from '@/lib/intake/parser/sale-ad';
import { isIntakeConfigured } from '@/lib/intake/channels/whatsapp/config';
import { whatsappTemplateName } from '@/lib/intake/channels/whatsapp/send';
import { parsePayload, parsePhotoUrls } from '@/lib/imports/publish';
import { ReviewForm } from './review-form';

export const revalidate = 30;
export const maxDuration = 60;

/** Redirect codes → a banner. There is no toast library in this codebase. */
/**
 * What happened to the URLs the operator pasted.
 *
 * A refusal is not an error to apologise for — `ingestPastedImageUrls` declines
 * anything off Facebook's photo CDN, which is the SSRF guard doing its job —
 * but it must be VISIBLE, because the operator's next move (paste the right
 * URL, or upload the file by hand) depends entirely on knowing it happened.
 */
function photoResult(
  added: string | undefined,
  refused: string | undefined
): { ok: boolean; title: string; detail: string } | null {
  if (added === undefined && refused === undefined) return null;

  const stored = Number(added) || 0;
  const rejected = Number(refused) || 0;
  if (!stored && !rejected) return null;

  return {
    ok: rejected === 0,
    title: rejected
      ? `${plural(stored, 'photo')} added, ${rejected} could not be fetched`
      : `${plural(stored, 'photo')} added`,
    detail: rejected
      ? 'Only Facebook’s own photo CDN is fetched, and a signed photo link expires. Re-copy the image address from the post, or download the photo and upload it above.'
      : 'Copied into our storage, so they survive the original links expiring.',
  };
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

const RESULTS: Record<string, { ok: boolean; title: string; detail: string }> = {
  saved: { ok: true, title: 'Draft saved', detail: 'Nothing is public yet.' },
  extracted: {
    ok: true,
    title: 'Re-read the post text',
    detail: 'Check the fields below — anything you had typed by hand was kept.',
  },
  'asked-sent': {
    ok: true,
    title: 'Asked the owner — nothing is published',
    detail:
      'They have a preview link and can reply YES or NO. If they never reply, this stays unpublished, which is the intended outcome.',
  },
  'asked-dry_run': {
    ok: false,
    title: 'The owner was NOT asked',
    detail:
      'Either owner messaging is switched off or no approved WhatsApp consent template is registered. The message was composed and logged, not sent — so no consent can arrive and this will never publish.',
  },
  'asked-failed': {
    ok: false,
    title: 'WhatsApp rejected the consent request',
    detail:
      'The owner does not know we are asking, and nothing will publish. Check the number and the approved template.',
  },
  no_text: {
    ok: false,
    title: 'Nothing to read',
    detail: 'Paste the post text into the box before re-reading it.',
  },
  incomplete: {
    ok: false,
    title: 'Not enough to ask about',
    detail:
      'Title, city, bedrooms, monthly rent and the owner’s phone number are all required. The consent message quotes these back to the owner.',
  },
  already_asked: {
    ok: false,
    title: 'This owner has already been asked',
    detail:
      'A second unsolicited message to someone who has not replied is harassment, and it costs WhatsApp account quality. Wait for their answer.',
  },
  consent_failed: {
    ok: false,
    title: 'Could not send the consent request',
    detail: 'Nothing was published. Try again; if it repeats, check the server logs.',
  },
};

export default async function ImportReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    saved?: string;
    extracted?: string;
    asked?: string;
    added?: string;
    refused?: string;
  }>;
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
  const resultKey = query.asked
    ? `asked-${query.asked}`
    : query.error ?? (query.saved ? 'saved' : query.extracted ? 'extracted' : null);
  /*
   * `addPhotoUrlsAction` has always redirected with these counts, and this page
   * has never read them — so `ingestPastedImageUrls`'s promise that "the screen
   * can say 3 added, 1 refused instead of silently keeping fewer photos than
   * the operator pasted" went unkept, and a refused URL looked exactly like a
   * successful one. The counts are dynamic, so this cannot live in RESULTS.
   */
  const result = photoResult(query.added, query.refused) ?? (resultKey ? RESULTS[resultKey] : null);

  const parsed = parsePayload(record.parsedPayload);
  const photos = parsePhotoUrls(record.photoUrls);

  // Recomputed from the current text rather than stored: the operator may have
  // pasted the post since the draft was created, and the number they need to
  // confirm is the one in front of them now.
  const phoneCandidates = extractPhoneNumbers(record.rawText);

  // A sale ad published as a rental is worse than one not published at all.
  // publishImport does not run the intake checks, so this is the only place it
  // gets caught — advisory, never blocking, because the operator can see the
  // original and we cannot.
  // `hasRent` is passed so a stated monthly rent settles it — the function is
  // explicitly a tiebreaker for ads the parser could not price.
  const saleAd = record.rawText
    ? detectSaleAd(record.rawText, parsed.rentPerMonth != null).looksLikeSale
    : false;

  /*
   * TWO templates, two different failures, and this screen used to check only
   * the wrong one.
   *
   * `consent` is what the button on this page sends. Without it the ask is a
   * dry run, so no consent can ever arrive and — the importer being opt-in —
   * the listing can never publish. That is a blocker, and it has to be said
   * BEFORE the operator presses Ask, not in a red banner afterwards.
   *
   * `import` is the go-live notice, sent after a YES. Without it the listing
   * still publishes perfectly well; the owner is simply never told. That is a
   * warning, not a blocker.
   *
   * Checking only `import` meant a project with the notice configured and the
   * ask not — exactly production on 2026-09-11 — showed nothing at all.
   */
  const intakeLive = isIntakeConfigured();
  const consentUndeliverable = intakeLive && !whatsappTemplateName('consent');
  const ownerMessagesUndeliverable = intakeLive && !whatsappTemplateName('import');

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

      {consentUndeliverable && (
        <section className="mb-4 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          <p className="font-semibold">Nothing here can be published yet</p>
          <p>
            No approved WhatsApp consent template is registered, so asking the owner
            only composes and logs a message — no consent can arrive, and the importer
            publishes nothing without it. Register the template and set{' '}
            <code>WHATSAPP_CONSENT_TEMPLATE</code> before asking anyone. The invite
            comment above still works today.
          </p>
        </section>
      )}

      {ownerMessagesUndeliverable && (
        <section className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-semibold">Owners are not being messaged</p>
          <p>
            No approved WhatsApp template is registered, so the notice is composed and
            logged but never sent. Publishing still works. See the go-live runbook to
            register one and set <code>WHATSAPP_IMPORT_TEMPLATE</code>.
          </p>
        </section>
      )}

      <ReviewForm
        importId={record.id}
        saleAd={saleAd}
        shareOnSocial={record.shareOnSocial}
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
