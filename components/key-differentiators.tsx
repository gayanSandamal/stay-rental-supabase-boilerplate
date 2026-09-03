import { Zap, Droplet, Wifi, ShieldCheck, MapPin, Clock, Wallet } from 'lucide-react';
import { ScrollReveal } from './scroll-reveal';
import { isFeatureEnabled } from '@/lib/feature-flags';

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Checked Before It Goes Live',
    // Was: "Every landlord provides ownership documents and a government-issued
    // ID. Our ops team cross-checks before publishing." None of that exists —
    // there is no document, ID or deed upload anywhere in the app, and
    // `landlords.kycVerified` is written only by the seed scripts. What DOES
    // happen: WhatsApp OTP verification of the contact number, automated text
    // and image moderation, unverified numbers stripped from descriptions, and
    // an ops review before publishing.
    description:
      'Contact numbers are verified by WhatsApp, and every listing passes automated checks and an ops review before it publishes.',
    tag: 'Scam Resistant',
    gradient: 'from-emerald-600 to-teal-700',
    tagColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    icon: Zap,
    title: 'Power Resilience Filters',
    description:
      'Filter by generator, solar, UPS, or utility only. Find properties that match your power needs — crucial for Sri Lanka.',
    tag: 'Sri Lanka Specific',
    gradient: 'from-amber-500 to-amber-700',
    tagColor: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    icon: Droplet,
    title: 'Water Source Info',
    description:
      'Know the water source before you commit — mains, tank, borehole. Essential transparency for long-term rentals.',
    tag: 'Full Transparency',
    gradient: 'from-sky-500 to-teal-600',
    tagColor: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  {
    icon: Wifi,
    title: 'Fiber Internet Ready',
    description:
      'Filter by fiber availability and ISP options per property. Remain connected seamlessly — perfect for remote workers.',
    tag: 'Work From Home',
    gradient: 'from-teal-600 to-teal-800',
    tagColor: 'bg-teal-50 text-teal-800 border-teal-200',
  },
  {
    icon: MapPin,
    title: 'Hyper-Local Focus',
    description:
      'Built from the ground up for the Sri Lankan rental market. Every filter, every field, every feature designed locally.',
    tag: 'Built for SL',
    gradient: 'from-amber-600 to-amber-800',
    tagColor: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  {
    icon: Clock,
    title: 'Direct Contact',
    description:
      'Contact landlords directly via call or WhatsApp. No middlemen, no booking fees — just you and the property owner.',
    tag: 'Easy to Use',
    gradient: 'from-teal-700 to-teal-900',
    tagColor: 'bg-teal-50 text-teal-800 border-teal-200',
  },
  {
    id: 'plans',
    icon: Wallet,
    // Was "Affordable Plans" / "Budget Friendly". Affordability is a comparison
    // — it invites the reader to go and check what ikman charges. Free of
    // charge is not a comparison, so this card leads with the price even when
    // paid visibility is on: listings are free and unlimited on every tier by
    // design (LISTING_LIMITS = 999999).
    title: 'Free to List, Free to Rent',
    description:
      'Browsing, viewing and contacting owners costs nothing, and listing a property is free and unlimited. Optional paid visibility is the only thing we ever charge for.',
    tag: 'No Listing Fees',
    gradient: 'from-emerald-500 to-teal-600',
    tagColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
];

// Copy for the "plans" card when paid visibility is off — i.e. when literally
// nothing on the platform costs money, which is the default and current state.
const FREE_PLANS_CARD = {
  title: 'Totally, 100% Free of Charge',
  description:
    'Not a trial, not a first-month offer. Browse, view and contact owners free — and list unlimited properties free, with no commission when you find a tenant.',
  tag: '100% Free',
};

export function KeyDifferentiators() {
  const pricingEnabled = isFeatureEnabled('enablePricingSection');
  return (
    <section className="py-20 bg-[#F7F4ED] relative overflow-hidden">
      <div className="absolute inset-0 dot-pattern opacity-30 pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="text-center mb-14">
            <span className="inline-block px-3 py-1 text-xs font-semibold tracking-widest text-teal-800 bg-teal-50 border border-teal-200 rounded-full uppercase mb-4">
              Why Easy Rent
            </span>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight">
              We Solve What Others{' '}
              <span className="relative inline-block">
                <span className="gradient-text">Ignore</span>
              </span>
            </h2>
            <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
              Renting in Sri Lanka has unique challenges. We built every feature to tackle them head-on
              {pricingEnabled ? '.' : ' — and made the whole thing 100% free of charge.'}
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal stagger className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            const isPlans = 'id' in f && f.id === 'plans';
            const title = isPlans && !pricingEnabled ? FREE_PLANS_CARD.title : f.title;
            const description = isPlans && !pricingEnabled ? FREE_PLANS_CARD.description : f.description;
            const tag = isPlans && !pricingEnabled ? FREE_PLANS_CARD.tag : f.tag;
            return (
              <div
                key={i}
                className="group bg-white rounded-2xl p-7 border border-slate-200/80 card-hover card-glow shadow-sm"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.gradient} flex items-center justify-center mb-5 shadow-md group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>

                <span className={`inline-block px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-full border mb-3 ${f.tagColor}`}>
                  {tag}
                </span>

                <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">{description}</p>
              </div>
            );
          })}
        </ScrollReveal>
      </div>
    </section>
  );
}
