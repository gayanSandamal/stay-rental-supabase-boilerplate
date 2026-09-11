import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Download, Info } from 'lucide-react';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { PageHeader } from '@/components/back-office/page-header';
import { ImportUrlForm } from './import-url-form';

export const revalidate = 30;
export const maxDuration = 60;

const ERRORS: Record<string, string> = {
  bad_url:
    'That is not a Facebook post URL we can open. Paste the link to a single post — the address bar of the post itself, not a profile or a group home page.',
  no_url:
    'A link to the original post is needed, even when you paste the text. It is what anyone reviewing the listing later opens to check it against the advert.',
  resolve_failed:
    'Something went wrong reaching Facebook. Try again — or paste the post text in as well, which skips Facebook entirely.',
};

export default async function NewImportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireBackOfficeAccess();
  const flags = await loadFeatureFlags();
  if (!flags.enableFacebookImport) notFound();

  const { error } = await searchParams;
  const message = error ? ERRORS[error] : null;

  return (
    <section className="flex-1 p-4 lg:p-8">
      <Link
        href="/back-office/imports"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Imports
      </Link>

      <PageHeader icon={Download} title="Import a post" />

      {message && (
        <section
          role="status"
          className="mb-4 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900"
        >
          {message}
        </section>
      )}

      <div className="max-w-2xl space-y-4">
        {/*
          One line, above the form, because it changes what the operator does in
          the next three seconds. The old version of this screen explained the
          same thing in a hundred words UNDER the form — read once, scrolled
          past forever, and by then the slow path had already been taken.
        */}
        <p className="text-sm text-slate-600">
          Paste the post&rsquo;s <span className="font-medium text-slate-900">text</span> as
          well as its link and the draft is ready at once. Link alone means waiting on
          Facebook, which usually refuses.
        </p>

        <ImportUrlForm />

        {/*
          The reasoning, one tap away rather than in the way. An operator meets
          this screen daily; the explanation is worth reading once and is worth
          finding again when a colleague asks why the URL did nothing.
        */}
        <details className="group rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-600">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2.5 font-medium text-slate-700 hover:text-slate-900">
            <Info className="h-4 w-4 shrink-0 text-slate-400" />
            Why Facebook usually hands over nothing
          </summary>
          <div className="space-y-2 border-t border-slate-200 px-3 py-3">
            <p>
              Facebook removed the groups API in April 2024, and reading another
              page&rsquo;s posts needs a review process we have not been through. Expect
              a public preview at best, and nothing at all for group posts — so the
              text box above is the real input, not a fallback.
            </p>
            <p>
              Photos are added on the next screen: upload them, or paste the image
              URLs copied out of the post. The link you give is kept either way, so
              anyone can check the listing against the original later.
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}
