import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { resolveConsentToken } from '@/lib/imports/consent';
import { parsePayload, parsePhotoUrls } from '@/lib/imports/publish';

/**
 * "Here is exactly what we are asking to publish."
 *
 * Reached from the URL button on the consent template, via /l/<token>. The
 * recipient has been asked whether we may list their property and has not
 * answered, so this page is deliberately the least it can be:
 *
 *  - IT RENDERS FROM post_imports, NOT FROM listings. No listing row exists
 *    yet, and that is the point — nothing about this property is in the table
 *    the marketplace reads from, so no query, sitemap or search page can
 *    surface it however this page behaves.
 *  - IT MINTS NO SESSION. An access link signs the landlord in; this one
 *    cannot, because agreeing to look is not agreeing to be listed.
 *  - IT MUTATES NOTHING ON GET, the same rule the access-link route follows.
 *  - IT IS NEVER INDEXED. The content is a private ask about someone's
 *    property, and the URL contains a bearer token.
 *
 * The token stops resolving the moment they answer, so the page 404s once the
 * question is settled rather than lingering as a stale view of a decision
 * already taken.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your listing preview · Easy Rent',
  robots: { index: false, follow: false, nocache: true },
};

function formatRent(value: number | null): string {
  if (value == null) return 'Rent to be confirmed';
  return `LKR ${value.toLocaleString('en-LK')} / month`;
}

export default async function ConsentPreviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const record = await resolveConsentToken(token);
  if (!record) notFound();

  const parsed = parsePayload(record.parsedPayload);
  const photos = parsePhotoUrls(record.photoUrls);
  const rent = parsed.rentPerMonth == null ? null : Number(parsed.rentPerMonth);

  const facts: Array<[string, string]> = [
    ['Monthly rent', formatRent(rent)],
    ['Bedrooms', parsed.bedrooms == null ? 'Not stated' : String(parsed.bedrooms)],
    ['Bathrooms', parsed.bathrooms == null ? 'Not stated' : String(parsed.bathrooms)],
    ['Location', [parsed.city, parsed.district].filter(Boolean).join(', ') || 'Not stated'],
  ];

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">This is only a preview — nothing is published.</p>
        <p className="mt-1">
          We found your advert on Facebook and would like to list it on Easy Rent, free of
          charge. Reply <strong>YES</strong> on WhatsApp and we will publish it. Reply{' '}
          <strong>NO</strong> and we will delete everything we hold. If you do not reply, we
          will not publish it.
        </p>
      </div>

      <h1 className="mt-6 text-2xl font-bold text-gray-900">
        {parsed.title || 'Your property'}
      </h1>
      <p className="mt-1 text-lg font-semibold text-gray-800">{formatRent(rent)}</p>

      {photos.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {photos.slice(0, 6).map((url, i) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={url}
              src={url}
              alt={`Photo ${i + 1} of the property`}
              className="h-40 w-full rounded-md object-cover"
            />
          ))}
        </div>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-4">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
            <dd className="mt-0.5 text-sm font-medium text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>

      {parsed.description && (
        <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-gray-700">
          {parsed.description}
        </p>
      )}

      <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
        <p className="font-semibold text-gray-900">What listing on Easy Rent means</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Tenants contact you directly on your own number. We never take a commission.</li>
          <li>
            We may also share it on Easy Rent&apos;s Facebook, Instagram and TikTok pages. Your
            phone number is never shown in those posts.
          </li>
          <li>It is completely free, and you can remove it at any time by replying REMOVE.</li>
        </ul>
      </div>
    </main>
  );
}
