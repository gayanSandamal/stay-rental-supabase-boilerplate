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
      'Priority contact with landlords',
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
    name: 'Basic',
    price: 'LKR 500',
    period: '/listing/month',
    features: ['List on Stay Rental', 'Verified tenant leads', 'Direct contact'],
    icon: Building2,
  },
  {
    name: 'Premium',
    price: 'LKR 1,000',
    period: '–1,500/month',
    features: ['Everything in Basic', 'Featured placement', 'Analytics dashboard'],
    icon: Zap,
  },
  {
    name: 'Subscription',
    price: 'LKR 2,000',
    period: '/month',
    features: ['Unlimited listings', 'All Premium benefits', 'Priority support'],
    icon: Building2,
  },
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
              Free to start. Upgrade when you need more. No hidden fees.
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
        <ScrollReveal stagger className="grid md:grid-cols-3 gap-6 mb-8">
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
