import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import { eligibleAreas, findEligibleArea } from '@/lib/seo/area-eligibility';
import { areaPath, areaUrl } from '@/lib/seo/urls';
import { jsonLdHtml, breadcrumbList } from '@/lib/seo/jsonld';
import { ListingsResultsSkeleton } from '../../listings/listings-results-skeleton';
import { AreaResults } from './area-results';
import { cityAliases } from '@/lib/seo/area-names';

/*
 * `revalidate = 30`, never `force-dynamic`. The eligibility snapshot is already
 * TTL-cached per instance, so force-dynamic would buy no extra freshness while
 * costing this page its prerendered shell — see the performance notes in
 * CLAUDE.md.
 */
export const revalidate = 30;

/*
 * Only areas that currently clear the inventory threshold get prerendered.
 * `dynamicParams` stays true (the default) so a city that crosses the threshold
 * between builds renders on demand rather than 404ing until the next deploy —
 * the page component re-checks eligibility either way.
 */
export async function generateStaticParams(): Promise<Array<{ area: string }>> {
  try {
    const areas = await eligibleAreas();
    return areas.map((a) => ({ area: a.slug }));
  } catch {
    // A build without database access must not fail; these render on demand.
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ area: string }>;
}): Promise<Metadata> {
  const { area: slug } = await params;
  const area = await findEligibleArea(slug);
  if (!area) return { robots: { index: false, follow: false } };

  const where = area.kind === 'district' ? `${area.name} District` : area.name;
  const title = `Houses & Apartments for Rent in ${where}, Sri Lanka`;
  const description =
    `${area.listingCount} verified mid-to-long-term rentals in ${where}. ` +
    `Deal directly with the owner — free to browse and free to contact. ` +
    `Compare rent, deposit months, power backup, water source and fibre availability.`;

  return {
    title,
    description,
    alternates: { canonical: areaUrl(area.name) },
    openGraph: {
      type: 'website',
      title,
      description,
      url: areaUrl(area.name),
      siteName: 'Easy Rent',
      locale: 'en_LK',
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Easy Rent' }],
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function AreaPage({
  params,
}: {
  params: Promise<{ area: string }>;
}) {
  const { area: slug } = await params;
  const area = await findEligibleArea(slug);

  /*
   * Below the inventory threshold the page does not exist. This is the whole
   * design: an empty "Houses for rent in X" page is thin content, and at scale
   * a set of them is what Google's scaled-content-abuse policy demotes a domain
   * for. Better a 404 than a page that wastes a renter's click.
   */
  if (!area) notFound();

  const siblings = (await eligibleAreas()).filter((a) => a.slug !== area.slug).slice(0, 12);
  const where = area.kind === 'district' ? `${area.name} District` : area.name;
  const aliases = cityAliases(area.name);

  return (
    <main className="min-h-screen bg-[#F7F4ED]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdHtml(
            breadcrumbList([
              { name: 'Home', path: '/' },
              { name: 'Rentals', path: '/rentals' },
              { name: where, path: areaPath(area.name) },
            ])
          ),
        }}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <nav aria-label="Breadcrumb" className="mb-5">
          <ol className="flex items-center gap-1 text-sm text-slate-500">
            <li><Link href="/" className="hover:text-teal-700 transition-colors">Home</Link></li>
            <li><ChevronRight className="h-3.5 w-3.5 text-slate-300" /></li>
            <li><Link href="/rentals" className="hover:text-teal-700 transition-colors">Rentals</Link></li>
            <li><ChevronRight className="h-3.5 w-3.5 text-slate-300" /></li>
            <li className="text-slate-800 font-medium">{where}</li>
          </ol>
        </nav>

        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Houses &amp; Apartments for Rent in {where}
          </h1>
          {/*
            The Sinhala and Tamil names come from the gazetteer, which already
            carries both for every curated town (asserted per-town in
            tests/unit/gazetteer.test.ts). Rendering them is free coverage of
            the same query typed in either script — the way most renters in Sri
            Lanka actually search.
          */}
          {aliases.length > 0 && (
            <p className="text-sm text-slate-500 mb-3" lang="und">
              {aliases.join(' · ')}
            </p>
          )}
          <p className="text-slate-600 max-w-3xl">
            Mid-to-long-term rentals (1–12+ months) in {where}, checked before they
            go live. Every contact number is verified, and Easy Rent never takes a
            commission — free to browse and free to contact. Filter by rent,
            deposit months, notice period, power backup, water source and fibre
            availability.
          </p>
        </header>

        <Suspense fallback={<ListingsResultsSkeleton />}>
          <AreaResults area={area} />
        </Suspense>

        {siblings.length > 0 && (
          <nav aria-label="Other areas" className="mt-12 border-t border-slate-200 pt-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">
              Rentals in other areas
            </h2>
            <ul className="flex flex-wrap gap-2">
              {siblings.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={areaPath(s.name)}
                    className="inline-block rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-teal-600 hover:text-teal-700 transition-colors"
                  >
                    {s.name}
                    <span className="ml-1.5 text-slate-400">{s.listingCount}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </main>
  );
}
