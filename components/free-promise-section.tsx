import Link from 'next/link';
import { ArrowRight, BadgeCheck, HandCoins, Infinity as InfinityIcon, Users } from 'lucide-react';
import { ScrollReveal } from './scroll-reveal';
import {
  FREE_LANDLORD_LINE_PAID,
  FREE_RENTER_LINE,
  isPlatformFullyFree,
} from '@/lib/free-copy';

/**
 * The price answer, stated once and unmissably.
 *
 * On a marketplace where every competitor charges landlords (ikman charges for
 * rentals above LKR 10,000/month), "free" is the whole pitch — but a visitor
 * who reads "free" on a hero assumes a catch further down. This section is
 * where the catch would be, so it names the four charges that do not exist
 * instead of listing prices.
 *
 * It renders only while `enablePricingSection` is off — i.e. while nothing on
 * the platform is actually for sale. When paid visibility goes live the
 * PricingSection takes this slot on the homepage and the copy here steps back
 * to the honest "listings are free, visibility is not" version.
 */

const NO_CHARGES = [
  {
    icon: HandCoins,
    title: 'No listing fee',
    text: 'Post your property without paying a rupee. Not a trial, not a first-month offer — free of charge.',
  },
  {
    icon: BadgeCheck,
    title: 'No commission',
    text: 'Find a tenant and keep every rupee of the rent. We take no cut, ever, at any point.',
  },
  {
    icon: InfinityIcon,
    title: 'No limits',
    text: 'List one property or fifty. Unlimited active listings, still 100% free of charge.',
  },
  {
    icon: Users,
    title: 'Nothing for renters either',
    text: 'Search, filter, view full details and call or WhatsApp the owner — free, without even an account.',
  },
];

export function FreePromiseSection() {
  const fullyFree = isPlatformFullyFree();

  return (
    <section className="py-20 bg-white relative overflow-hidden">
      <div className="absolute inset-0 dot-pattern opacity-20 pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="text-center mb-14">
            <span className="inline-block px-3 py-1 text-xs font-semibold tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full uppercase mb-4">
              What It Costs
            </span>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight">
              Totally,{' '}
              <span className="gradient-text">100% Free of Charge</span>
            </h2>
            {/* The heading has already said "100% free of charge", so this
                line spends its words on WHO it applies to instead of repeating
                the phrase a third time in two sentences. */}
            <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
              {fullyFree
                ? 'Landlords list unlimited properties without paying a rupee. Renters search, view and contact owners without paying a rupee. Nobody is charged for anything.'
                : `${FREE_LANDLORD_LINE_PAID} ${FREE_RENTER_LINE}`}
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal stagger className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {NO_CHARGES.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="bg-[#F7F4ED] rounded-2xl p-7 border border-emerald-100 shadow-sm card-hover"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center mb-5 shadow-md">
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">{item.text}</p>
              </div>
            );
          })}
        </ScrollReveal>

        <ScrollReveal>
          <div className="mt-12 flex flex-wrap justify-center gap-4">
            <Link
              href="/list-your-property"
              className="btn-amber-gradient inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-white font-semibold text-base shadow-xl shadow-amber-800/25 hover:opacity-95 transition-opacity"
            >
              List Your Property Free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/listings"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-base border border-slate-300 text-slate-800 hover:bg-slate-50 transition-colors"
            >
              Browse Listings Free
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
