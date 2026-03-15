import { ShieldCheck, CheckCircle2, Eye, Building2 } from 'lucide-react';
import { getActiveListings, getUser } from '@/lib/db/queries';
import { isUserPremium } from '@/lib/subscription';
import { AnimatedCounter } from './animated-counter';

const STATS = [
  {
    icon: ShieldCheck,
    value: '100%',
    label: 'Verified',
    sub: 'All landlords verified',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
    isPercent: true,
  },
  {
    icon: CheckCircle2,
    value: null,
    key: 'verified',
    label: 'Verified Listings',
    sub: 'Documents confirmed',
    color: 'text-teal-700',
    bg: 'bg-teal-50',
    border: 'border-teal-100',
  },
  {
    icon: Eye,
    value: null,
    key: 'visited',
    label: 'Site Inspected',
    sub: 'Visited by our team',
    color: 'text-teal-600',
    bg: 'bg-teal-50',
    border: 'border-teal-100',
  },
  {
    icon: Building2,
    value: null,
    key: 'total',
    label: 'Active Listings',
    sub: 'Available right now',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
  },
];

export async function TrustSignals() {
  const user = await getUser();
  const isPremium = isUserPremium(user);
  const listings = await getActiveListings({
    limit: 1000,
    excludeExclusive: !isPremium,
    hideNewListingsHours: isPremium ? undefined : 24,
  });
  const counts = {
    verified: listings.filter((l) => l.verified).length,
    visited: listings.filter((l) => l.visited).length,
    total: listings.length,
  };

  return (
    <section className="bg-white py-14 border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs font-semibold tracking-widest text-slate-500 uppercase mb-10">
          Trusted by renters across Sri Lanka
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {STATS.map((stat, i) => {
            const Icon = stat.icon;
            const rawVal = stat.value ?? String(counts[stat.key as keyof typeof counts] ?? '0');
            const numericVal = parseFloat(rawVal.replace(/[^0-9.]/g, ''));

            return (
              <div
                key={i}
                className={`flex flex-col items-center text-center p-6 rounded-2xl border ${stat.border} ${stat.bg} card-hover`}
              >
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3 bg-white shadow-sm">
                  <Icon className={`h-6 w-6 ${stat.color}`} />
                </div>
                <div className={`text-3xl font-extrabold ${stat.color} mb-1`}>
                  <AnimatedCounter
                    value={numericVal}
                    suffix={stat.isPercent ? '%' : ''}
                    duration={1600 + i * 200}
                  />
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
