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
  resolve_failed:
    'Something went wrong reaching Facebook. Try again, or paste the post text into the next screen instead.',
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
        <ImportUrlForm />

        {/*
          Said up front rather than discovered as a failure. An operator who
          expects the URL to do everything reads the empty review screen as a
          bug; one who knows Facebook refuses group posts reads it as the
          normal case and starts pasting.
        */}
        <div className="flex gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <div className="space-y-2">
            <p>
              <span className="font-medium text-slate-900">
                Facebook will usually not hand over the post.
              </span>{' '}
              It removed the groups API in April 2024, and reading another page&rsquo;s
              posts needs a review process we have not been through. Expect a public
              preview at best, and nothing at all for group posts.
            </p>
            <p>
              That is fine — the next screen always lets you paste the post text and
              upload its photos. The URL is kept either way, so anyone can check the
              listing against the original later.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
