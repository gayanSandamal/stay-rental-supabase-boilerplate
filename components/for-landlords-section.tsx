import Link from 'next/link';
import { ScrollReveal } from './scroll-reveal';
import { Shield, Users, ArrowRight } from 'lucide-react';

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
              <span className="gradient-text">Easy Rent</span>
            </h2>
            <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
              List your first 3 properties free. Need more visibility? Boost from LKR 250.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal stagger>
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
              <Shield className="h-10 w-10 text-teal-600 mb-4" />
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                Direct Tenant Contact
              </h3>
              <p className="text-slate-600 text-sm">
                Your contact numbers are shown on listings. Tenants call or WhatsApp you
                directly—no middleman.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
              <Users className="h-10 w-10 text-teal-600 mb-4" />
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                Ops Verification
              </h3>
              <p className="text-slate-600 text-sm">
                Our team verifies your listing and optionally visits the property.
                You handle tenant contact directly.
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
