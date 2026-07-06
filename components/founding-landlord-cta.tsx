import Link from 'next/link';
import { ShieldCheck, Eye, MessageCircle, ArrowRight } from 'lucide-react';
import { ScrollReveal } from './scroll-reveal';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { getConciergeWhatsAppLink } from '@/lib/site-config';

/**
 * Founding-stage replacement for the Testimonials section (gated by the
 * `showFoundingStageCopy` flag). No fabricated social proof — an honest
 * "we're new, join us at the start" pitch that doubles as supply acquisition.
 */
const PROMISES = [
  {
    icon: ShieldCheck,
    title: 'Free listings, forever',
    text: 'Founding landlords list unlimited properties free — no fees, no commissions, ever.',
    gradient: 'from-teal-600 to-teal-800',
  },
  {
    icon: Eye,
    title: 'Personally verified',
    text: 'We check every listing and verify every contact number before it goes live. Many properties we visit in person.',
    gradient: 'from-emerald-600 to-teal-700',
  },
  {
    icon: MessageCircle,
    title: 'Direct to your phone',
    text: 'Tenants reach you by phone or WhatsApp. No middlemen, no booking fees, no missed leads.',
    gradient: 'from-amber-500 to-amber-700',
  },
];

export function FoundingLandlordCta() {
  // When the concierge is live, "send us your photos" becomes the real
  // WhatsApp deep link instead of routing through the landing page.
  const conciergeLink = isFeatureEnabled('enableWhatsAppConcierge')
    ? getConciergeWhatsAppLink('from homepage founding section')
    : null;

  return (
    <section className="py-20 bg-[#F7F4ED] relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px divider-gradient" />
      <div className="absolute inset-0 dot-pattern opacity-20 pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="text-center mb-14">
            <span className="inline-block px-3 py-1 text-xs font-semibold tracking-widest text-amber-700 bg-amber-50 border border-amber-200 rounded-full uppercase mb-4">
              Founding Programme
            </span>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight">
              Be a <span className="gradient-text">Founding Landlord</span>
            </h2>
            <p className="mt-4 text-lg text-slate-600 max-w-xl mx-auto">
              We&apos;re building Sri Lanka&apos;s most trusted rental marketplace — and we&apos;re
              starting honestly: no fake counts, no fake reviews. Just verified homes and
              direct contact. Join at the start and help set the standard.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal stagger className="grid md:grid-cols-3 gap-7">
          {PROMISES.map((p, i) => (
            <div
              key={i}
              className="relative bg-white rounded-2xl p-7 border border-slate-200/80 shadow-sm card-hover card-glow flex flex-col"
            >
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${p.gradient} flex items-center justify-center shadow-md mb-5`}>
                <p.icon className="h-5 w-5 text-white" />
              </div>
              <div className="text-base font-bold text-slate-900 mb-2">{p.title}</div>
              <p className="text-slate-700 text-sm leading-relaxed flex-1">{p.text}</p>
            </div>
          ))}
        </ScrollReveal>

        <ScrollReveal>
          <div className="mt-14 flex flex-col sm:flex-row items-center justify-center gap-5 py-8 px-8 rounded-2xl bg-white border border-slate-200 shadow-sm text-center sm:text-left">
            <p className="text-slate-700 text-sm sm:text-base max-w-md">
              Have a property to rent? We&apos;ll help you create your first listing —
              send us your photos and we&apos;ll handle the rest.
            </p>
            {conciergeLink ? (
              <a
                href={conciergeLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-md transition-colors shrink-0"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp us your photos
              </a>
            ) : (
              <Link
                href="/list-your-property"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold shadow-md transition-colors shrink-0"
              >
                List your property free
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
