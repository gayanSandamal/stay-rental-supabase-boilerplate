import Link from 'next/link';
import { ScrollReveal } from './scroll-reveal';
import { Shield, Users, ArrowRight, Building2 } from 'lucide-react';

export function ForLandlordsSection() {
  return (
    <section className="py-20 lg:py-28 bg-[#F7F4ED] relative overflow-hidden">
      <div className="absolute inset-0 dot-pattern opacity-30 pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="text-center mb-12">
            <span className="inline-block px-3 py-1 text-xs font-semibold tracking-widest text-teal-800 bg-teal-50 border border-teal-200 rounded-full uppercase mb-4">
              For Landlords
            </span>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight">
              List Your Property With{' '}
              <span className="gradient-text">Stay Rental</span>
            </h2>
            <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
              Reach verified tenants, get viewing coordination, and enjoy hassle-free
              listing management. Free to list — our ops team handles the rest.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal stagger>
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
              <Shield className="h-10 w-10 text-teal-600 mb-4" />
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                Verified Tenant Leads
              </h3>
              <p className="text-slate-600 text-sm">
                Every viewing request includes contact details. We screen and coordinate
                so you only meet serious tenants.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
              <Users className="h-10 w-10 text-teal-600 mb-4" />
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                Dedicated Ops Support
              </h3>
              <p className="text-slate-600 text-sm">
                Our team manages inquiries, schedules viewings, and keeps you updated.
                No daily re-posting needed.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
              <Building2 className="h-10 w-10 text-teal-600 mb-4" />
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                Business Accounts
              </h3>
              <p className="text-slate-600 text-sm">
                Manage multiple properties under one account. Ideal for agencies and
                portfolio landlords.
              </p>
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal>
          <div className="text-center">
            <Link
              href="/list-your-property"
              className="btn-amber-gradient inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-white font-semibold text-base shadow-xl shadow-amber-800/25 hover:opacity-95 transition-opacity"
            >
              Learn More & Get Started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
