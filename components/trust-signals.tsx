import { ShieldCheck, CheckCircle2, Phone, Building2 } from 'lucide-react';
import { getPublicListingCounts, getUser } from '@/lib/db/queries';
import { isUserPremium, newListingHideHours } from '@/lib/subscription';
import { AnimatedCounter } from './animated-counter';

/**
 * Every card here must be either a LIVE COUNT or a standing fact about how the
 * product works. Nothing hardcoded that reads as a measurement.
 *
 * Two cards were removed because they described things that do not happen:
 *
 * - "100% / Verified / All landlords verified" was a hardcoded string. No
 *   landlord has ever been KYC-verified — `landlords.kycVerified` is written
 *   only by the seed scripts, and the app has no document, ID or deed upload
 *   path at all. It also rendered "100%" beside three zeros.
 * - "Site Inspected / Visited by our team" counted `listings.visited`, which no
 *   code path ever sets. It advertised a site-inspection service that has never
 *   existed, and would have read 0 forever.
 *
 * "Documents confirmed" is gone for the same reason — what actually happens
 * before a listing goes live is automated moderation plus an ops review.
 */
type Stat = {
  icon: typeof ShieldCheck;
  /** A live count read from the database. */
  key?: 'verified' | 'total';
  /** A standing fact — rendered as-is, never animated like a measurement. */
  text?: string;
  label: string;
  sub: string;
  color: string;
  bg: string;
  border: string;
};

const STATS: Stat[] = [
  {
    icon: Building2,
    key: 'total',
    label: 'Active Listings',
    sub: 'Available right now',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
  },
  {
    icon: CheckCircle2,
    key: 'verified',
    label: 'Checked Listings',
    sub: 'Reviewed before going live',
    color: 'text-teal-700',
    bg: 'bg-teal-50',
    border: 'border-teal-100',
  },
  {
    icon: Phone,
    text: 'Direct',
    label: 'Owner Contact',
    sub: 'Phone & WhatsApp, no middlemen',
    color: 'text-teal-600',
    bg: 'bg-teal-50',
    border: 'border-teal-100',
  },
  {
    icon: ShieldCheck,
    text: 'Free',
    label: 'To List',
    sub: 'No fees, no commission',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
  },
];

export async function TrustSignals() {
  const user = await getUser();
  const isPremium = isUserPremium(user);
  // One aggregate. This was `getActiveListings({ limit: 1000 })` — a thousand
  // full rows fetched, sorted and shipped so two integers could be counted off
  // them, on the homepage.
  const counts = await getPublicListingCounts({
    excludeExclusive: !isPremium,
    hideNewListingsHours: newListingHideHours(user),
  });

  return (
    <section className="bg-white py-14 border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Was "Trusted by renters across Sri Lanka" — a claim about an
            existing user base the platform does not have yet. */}
        <p className="text-center text-xs font-semibold tracking-widest text-slate-500 uppercase mb-10">
          Rentals direct from the owner
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {STATS.map((stat, i) => {
            const Icon = stat.icon;

            return (
              <div
                key={i}
                className={`flex flex-col items-center text-center p-6 rounded-2xl border ${stat.border} ${stat.bg} card-hover`}
              >
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3 bg-white shadow-sm">
                  <Icon className={`h-6 w-6 ${stat.color}`} />
                </div>
                <div className={`text-3xl font-extrabold ${stat.color} mb-1`}>
                  {stat.text ? (
                    // A standing fact, not a measurement — never animate it
                    // like a counter, which is what made a hardcoded "100%"
                    // read as though something had been counted.
                    stat.text
                  ) : (
                    <AnimatedCounter
                      value={counts[stat.key!]}
                      duration={1600 + i * 200}
                    />
                  )}
                </div>
                <div className="text-sm font-semibold text-slate-800">{stat.label}</div>
                <div className="text-xs text-slate-600 mt-0.5">{stat.sub}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
