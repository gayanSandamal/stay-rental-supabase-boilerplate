import { ShieldCheck, CheckCircle2, Eye, Building2 } from 'lucide-react';
import { getActiveListings } from '@/lib/db/queries';

const STATS = [
  {
    icon: ShieldCheck,
    value: '100%',
    label: 'KYC Verified',
    sub: 'All landlords verified',
    color: 'text-emerald-500',
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
  },
  {
    icon: CheckCircle2,
    value: null,
    key: 'verified',
    label: 'Verified Listings',
    sub: 'Documents confirmed',
    color: 'text-indigo-500',
    bg: 'bg-indigo-50',
    border: 'border-indigo-100',
  },
  {
    icon: Eye,
    value: null,
    key: 'visited',
    label: 'Site Inspected',
    sub: 'Visited by our team',
    color: 'text-violet-500',
    bg: 'bg-violet-50',
    border: 'border-violet-100',
  },
  {
    icon: Building2,
    value: null,
    key: 'total',
    label: 'Active Listings',
    sub: 'Available right now',
    color: 'text-amber-500',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
  },
];

export async function TrustSignals() {
  const listings = await getActiveListings({ limit: 1000 });
  const counts = {
    verified: listings.filter((l) => l.verified).length,
    visited: listings.filter((l) => l.visited).length,
    total: listings.length,
  };

  return (
    <section className="bg-white py-14 border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <p className="text-center text-xs font-semibold tracking-widest text-slate-500 uppercase mb-10">
          Trusted by renters across Sri Lanka
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {STATS.map((stat, i) => {
            const Icon = stat.icon;
            const val = stat.value ?? String(counts[stat.key as keyof typeof counts] ?? '0');
            return (
              <div
                key={i}
                className={`flex flex-col items-center text-center p-6 rounded-2xl border ${stat.border} ${stat.bg} card-hover`}
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 bg-white shadow-sm`}>
                  <Icon className={`h-6 w-6 ${stat.color}`} />
                </div>
                <div className={`text-3xl font-extrabold ${stat.color} mb-1`}>{val}</div>
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
