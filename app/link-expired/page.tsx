import Link from 'next/link';
import { MessageCircle, LinkIcon } from 'lucide-react';
import { getWhatsAppSupportNumber } from '@/lib/site-config';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Link expired | Easy Rent',
  robots: { index: false, follow: false },
};

/**
 * One page for every access-link failure (invalid, expired, revoked, deleted
 * account, provider busy). Deliberately generic: a page that distinguishes
 * "no such link" from "expired link" would confirm which tokens exist.
 *
 * It routes the landlord back through WhatsApp because that is the only channel
 * that can hand them a new link: a business-initiated WhatsApp message outside
 * the 24-hour service window needs an approved template, so they must message
 * us first to reopen the window.
 */
export default async function LinkExpiredPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const busy = reason === 'busy';
  const waNumber = getWhatsAppSupportNumber();
  const waHref = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent('LINK')}` : null;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-200">
        <LinkIcon className="h-7 w-7" />
      </div>

      <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
        {busy ? 'One moment — please try again' : 'This link has expired'}
      </h1>

      <p className="mt-3 max-w-md text-slate-600">
        {busy
          ? 'We were signing you in but hit a brief limit. Wait about a minute and tap your link again.'
          : 'Links we send over WhatsApp stop working after a while, for your security. Send us the word LINK on WhatsApp and we’ll reply with a fresh one straight away.'}
      </p>

      {waHref && !busy && (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-emerald-700"
        >
          <MessageCircle className="h-4 w-4" />
          Send “LINK” on WhatsApp
        </a>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
        <Link href="/sign-in" className="font-medium text-teal-700 hover:underline">
          Sign in with a password instead
        </Link>
        <Link href="/listings" className="font-medium text-teal-700 hover:underline">
          Browse listings
        </Link>
      </div>
    </main>
  );
}
