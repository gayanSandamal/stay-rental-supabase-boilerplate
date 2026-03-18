'use client';

import { Check, Home, Building2, Zap } from 'lucide-react';
import { ScrollReveal } from './scroll-reveal';
import Link from 'next/link';

const RENTER_PLANS = [
  {
    name: 'Free',
    price: 'LKR 0',
    period: 'forever',
    description: 'Everything you need to find a home',
    features: [
      'Browse all verified listings',
      'View full property details',
      'Contact landlords directly',
      'Up to 3 saved alerts',
    ],
    cta: 'Get Started Free',
    href: '/listings',
    highlighted: false,
    icon: Home,
  },
  {
    name: 'Premium',
    price: 'LKR 300',
    period: '/month',
    description: 'For serious renters who want an edge',
    features: [
      'Everything in Free',
      'Early access to new listings (24h head start)',
      'Unlimited saved alerts',
      'Exclusive listings first',
    ],
    cta: 'Upgrade to Premium',
    href: '/sign-up?plan=premium',
    highlighted: true,
    icon: Zap,
  },
];

const LANDLORD_PLANS = [
  {
    name: 'Free',
    price: 'LKR 0',
    period: 'forever',
    features: ['Unlimited active listings', 'Direct contact', 'Phone & WhatsApp on listing', 'List on Easy Rent'],
    icon: Building2,
  },
  {
    name: 'Starter',
    price: 'LKR 900',
    period: '/month',
    features: ['Unlimited active listings', '1 free Boost per month', 'Higher visibility', 'Renewal reminders'],
    icon: Building2,
  },
  {
    name: 'Pro',
    price: 'LKR 2,500',
    period: '/month',
    features: ['Unlimited active listings', '3 free Boosts per month', 'Featured priority', 'Listing performance', 'Faster approval', 'Custom profile URL'],
    icon: Zap,
  },
  {
    name: 'Agency',
    price: 'LKR 5,000',
    period: '/month',
    features: ['Unlimited active listings', '6 free Boosts per month', 'Agency badge', 'Team support', 'Bulk renewals', 'Priority support'],
    icon: Building2,
  },
];

const VISIBILITY_ADDONS = [
  { name: 'Boost', price: 'LKR 250', period: 'per 7 days', description: 'Improved ranking and exposure' },
  { name: 'Featured', price: 'LKR 500', period: 'per 7 days', description: 'Top placement in search' },
  { name: 'Urgent', price: 'LKR 150', period: 'per 7 days', description: 'Urgent badge for quick action' },
];

const BUNDLES = [
  { name: 'Quick Results Pack', price: 'LKR 350', description: 'Boost + Urgent (7 days each)' },
  { name: 'Priority Exposure Pack', price: 'LKR 650', description: 'Featured + Urgent (7 days each)' },
  { name: 'Landlord Starter Bundle', price: 'LKR 1,000', description: 'Starter 30 days + 1 Boost' },
];

export function PricingSection() {
  return (
    <section className="py-20 bg-white relative overflow-hidden">
      <div className="absolute inset-0 dot-pattern opacity-20 pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="text-center mb-16">
            <span className="inline-block px-3 py-1 text-xs font-semibold tracking-widest text-teal-800 bg-teal-50 border border-teal-200 rounded-full uppercase mb-4">
              Simple Pricing
            </span>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight">
              Plans That Fit{' '}
              <span className="gradient-text">Your Budget</span>
            </h2>
            <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
              List free. Pay only when you want more visibility, faster results, or included Boosts.
            </p>
          </div>
        </ScrollReveal>

        {/* Renter plans */}
        <ScrollReveal>
          <div className="mb-4">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Home className="h-5 w-5 text-teal-600" />
              For Renters
            </h3>
          </div>
        </ScrollReveal>
        <ScrollReveal stagger className="grid md:grid-cols-2 gap-6 mb-20 max-w-4xl">
          {RENTER_PLANS.map((plan) => {
            const Icon = plan.icon;
            return (
              <div
                key={plan.name}
                className={`rounded-2xl border-2 p-7 ${
                  plan.highlighted
                    ? 'border-teal-500 bg-teal-50/50 shadow-lg shadow-teal-900/5'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-teal-600" />
                  </div>
                  <h4 className="text-xl font-bold text-slate-900">{plan.name}</h4>
                </div>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-3xl font-extrabold text-slate-900">{plan.price}</span>
                  <span className="text-slate-600">{plan.period}</span>
                </div>
                <p className="text-sm text-slate-600 mb-5">{plan.description}</p>
                <ul className="space-y-2.5 mb-6">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`block w-full text-center py-3 rounded-xl font-semibold text-sm transition-all ${
                    plan.highlighted
                      ? 'btn-primary-gradient text-white'
                      : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            );
          })}
        </ScrollReveal>

        {/* Landlord plans */}
        <ScrollReveal>
          <div className="mb-4">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-amber-600" />
              For Landlords
            </h3>
          </div>
        </ScrollReveal>
        <ScrollReveal stagger className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          {LANDLORD_PLANS.map((plan) => {
            const Icon = plan.icon;
            return (
              <div
                key={plan.name}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-amber-600" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900">{plan.name}</h4>
                </div>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-2xl font-extrabold text-slate-900">{plan.price}</span>
                  <span className="text-sm text-slate-600">{plan.period}</span>
                </div>
                <ul className="space-y-2">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </ScrollReveal>
        <ScrollReveal className="mb-8">
          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
            <p className="text-sm font-bold text-amber-900 mb-3">Add-ons & Bundles</p>
            <div className="mb-4">
              <p className="text-xs font-semibold text-amber-800 mb-2">Paid visibility add-ons</p>
              <div className="flex flex-wrap gap-4 justify-center">
                {VISIBILITY_ADDONS.map((addon) => (
                  <div key={addon.name} className="text-center">
                    <p className="font-semibold text-amber-900">{addon.name}: {addon.price} {addon.period}</p>
                    <p className="text-xs text-amber-800">{addon.description}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-amber-800 mb-2">Bundles</p>
              <div className="flex flex-wrap gap-4 justify-center">
                {BUNDLES.map((bundle) => (
                  <div key={bundle.name} className="text-center">
                    <p className="font-semibold text-amber-900">{bundle.name}: {bundle.price}</p>
                    <p className="text-xs text-amber-800">{bundle.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollReveal>
        <ScrollReveal>
          <div className="text-center">
            <Link
              href="/list-your-property"
              className="btn-amber-gradient inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-white font-semibold text-base shadow-xl shadow-amber-800/25 hover:opacity-95 transition-opacity"
            >
              List Your Property
              <Building2 className="h-4 w-4" />
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
