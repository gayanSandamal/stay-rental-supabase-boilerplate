import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { eligibleAreas } from '@/lib/seo/area-eligibility';
import { areaPath, SITE_URL } from '@/lib/seo/urls';
import { jsonLdHtml, breadcrumbList } from '@/lib/seo/jsonld';
import { cityAliases } from '@/lib/seo/area-names';

export const revalidate = 30;

export const metadata: Metadata = {
  title: 'Rentals by Area in Sri Lanka',
  description:
    'Browse verified mid-to-long-term rentals by city and district across Sri Lanka — Colombo, Gampaha, Kandy, Galle, Jaffna and more. Free to browse, free to contact the owner.',
  alternates: { canonical: `${SITE_URL}/rentals` },
  openGraph: {
    type: 'website',
    title: 'Rentals by Area in Sri Lanka | Easy Rent',
    description:
      'Verified mid-to-long-term rentals by city and district across Sri Lanka. Deal directly with the owner.',
    url: `${SITE_URL}/rentals`,
    siteName: 'Easy Rent',
    locale: 'en_LK',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Easy Rent' }],
  },
};

export default function RentalsIndexPage() {
  return (
    <main className="min-h-screen bg-[#F7F4ED]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdHtml(
            breadcrumbList([
              { name: 'Home', path: '/' },
              { name: 'Rentals', path: '/rentals' },
            ])
          ),
        }}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Static shell — no await above this point, so it prerenders. */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Rentals by Area in Sri Lanka
          </h1>
          <p className="text-slate-600 max-w-3xl">
            Every area below has live listings right now. Rents, deposit months
            and notice periods vary a lot between districts, so start where you
            actually want to live — then filter on the things that decide a Sri
            Lankan rental: power backup, water source and fibre.
          </p>
        </header>

        <Suspense fallback={<AreaListSkeleton />}>
          <AreaList />
        </Suspense>
      </div>
    </main>
  );
}

function AreaListSkeleton() {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-20 rounded-xl bg-white/70 animate-pulse" />
      ))}
    </div>
  );
}

/**
 * The eligible-area list, below a Suspense boundary because it reads the
 * database. Everything above stays static and prerenderable.
 */
async function AreaList() {
  const areas = await eligibleAreas();

  /*
   * Honest empty state rather than a grid of dead links.
   *
   * This is the state production is in today: one archived listing, so no area
   * clears the threshold and this page has nothing to list. Saying so — and
   * pointing at the free-listing funnel — is worth more than fabricating a city
   * index whose every link 404s.
   */
  if (areas.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-10 text-center">
        <p className="text-slate-700 font-medium mb-1">No areas have live listings yet.</p>
        <p className="text-slate-500 text-sm mb-5">
          Area pages appear automatically as owners list their properties.
        </p>
        <Link
          href="/list-your-property"
          className="inline-block rounded-xl bg-teal-700 px-5 py-2.5 text-white text-sm font-semibold hover:bg-teal-800 transition-colors"
        >
          List your property free
        </Link>
      </div>
    );
  }

  const districts = areas.filter((a) => a.kind === 'district');
  const cities = areas.filter((a) => a.kind === 'city');

  return (
    <>
      {districts.length > 0 && <AreaGroup title="By district" areas={districts} />}
      {cities.length > 0 && <AreaGroup title="By city or town" areas={cities} />}
    </>
  );
}

function AreaGroup({
  title,
  areas,
}: {
  title: string;
  areas: Awaited<ReturnType<typeof eligibleAreas>>;
}) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold text-slate-900 mb-3">{title}</h2>
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {areas.map((area) => {
          const aliases = cityAliases(area.name);
          return (
            <li key={area.slug}>
              <Link
                href={areaPath(area.name)}
                className="block rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-teal-600 transition-colors"
              >
                <span className="font-medium text-slate-900">{area.name}</span>
                {aliases.length > 0 && (
                  <span className="block text-xs text-slate-400 mt-0.5" lang="und">
                    {aliases.join(' · ')}
                  </span>
                )}
                <span className="block text-sm text-slate-500 mt-0.5">
                  {area.listingCount} {area.listingCount === 1 ? 'rental' : 'rentals'}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
