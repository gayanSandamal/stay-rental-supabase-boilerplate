import Link from 'next/link';
import {
  Shield,
  Users,
  Eye,
  Clock,
  CheckCircle,
  ArrowRight,
  Phone,
  Building2,
  Zap,
  MessageCircle,
  Gift,
} from 'lucide-react';
import type { Metadata } from 'next';
import { ScrollReveal } from '@/components/scroll-reveal';
import { SiteFooter } from '@/components/site-footer';
import { WhatsAppConciergeButton } from '@/components/whatsapp-concierge-button';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { getConciergeWhatsAppLink } from '@/lib/site-config';
import { getUser } from '@/lib/db/queries';
import { accountGatedHref } from '@/lib/auth/cta';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://easyrent.lk';

export const metadata: Metadata = {
  title: 'List Your Property',
  description:
    'List your rental property on Easy Rent. Reach verified tenants, get viewing coordination, and enjoy a hassle-free listing experience in Sri Lanka.',
  alternates: {
    canonical: `${baseUrl}/list-your-property`,
  },
};

const benefits = [
  {
    icon: Shield,
    title: 'Direct Tenant Contact',
    description:
      'Your contact numbers are shown on your listing. Tenants call or WhatsApp you directly—no middleman, no delays.',
    tag: 'Direct Contact',
    gradient: 'from-emerald-600 to-teal-700',
    tagColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    icon: Eye,
    title: 'Property Visit Badge',
    description:
      'Our team visits your property and awards a "Visited" badge, increasing trust and attracting more tenants.',
    tag: 'Trust Signal',
    gradient: 'from-teal-600 to-teal-800',
    tagColor: 'bg-teal-50 text-teal-800 border-teal-200',
  },
  {
    icon: Users,
    title: 'Dedicated Ops Support',
    description:
      'Our ops team verifies your listing, optionally visits the property, and publishes it. You handle tenant contact directly.',
    tag: 'Verification',
    gradient: 'from-amber-500 to-amber-700',
    tagColor: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    icon: Clock,
    title: '30-Day Active Listings',
    description:
      'Your listing remains active for 30 days with easy renewal. No daily re-posting needed.',
    tag: 'Set & Forget',
    gradient: 'from-sky-500 to-teal-600',
    tagColor: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  {
    icon: Phone,
    title: 'Verified Contact Numbers',
    description:
      'Only platform-verified phone numbers are shown to tenants, reducing spam and ensuring real communication.',
    tag: 'No Spam',
    gradient: 'from-teal-700 to-teal-900',
    tagColor: 'bg-teal-50 text-teal-800 border-teal-200',
  },
  {
    icon: Building2,
    title: 'Business Accounts',
    description:
      'Manage multiple properties under a single business account. Ideal for agencies and portfolio landlords.',
    tag: 'For Agencies',
    gradient: 'from-amber-600 to-amber-800',
    tagColor: 'bg-amber-50 text-amber-800 border-amber-200',
  },
];

// Step 1 depends on whether the reader already has an account — telling a
// signed-in landlord to go and create one is the same dead end as pointing
// their CTA at /sign-up.
function buildSteps(isSignedIn: boolean) {
  return [
    isSignedIn
      ? {
          number: '1',
          title: 'Open the Form',
          description:
            "You're already signed in — start from the button above and go straight to the listing form.",
        }
      : {
          number: '1',
          title: 'Sign Up',
          description: 'Create your free landlord account in under a minute.',
        },
    ...restOfSteps,
  ];
}

const restOfSteps = [
  {
    number: '2',
    title: 'Submit Your Property',
    description:
      'Fill in property details, upload photos, and add your contact numbers.',
  },
  {
    number: '3',
    title: 'We Verify & Publish',
    description:
      'Our ops team reviews your listing, optionally visits the property, and publishes it.',
  },
  {
    number: '4',
    title: 'Tenants Contact You Directly',
    description:
      'Visitors see your phone and WhatsApp on the listing. They contact you directly to arrange viewings.',
  },
];

// Objection-handling FAQ. `conciergeOnly` entries render only when the
// WhatsApp concierge is enabled + configured.
function buildFaqs(conciergeAvailable: boolean) {
  const faqs = [
    {
      q: 'Is it really free?',
      a: 'Yes. Listing is free — no listing fees, no commissions, no charges when a tenant contacts you. Founding landlords keep free listings for good.',
    },
    {
      q: 'Do I need professional photos?',
      a: conciergeAvailable
        ? 'No — clear phone photos work fine. Or WhatsApp us 6 photos and we will prepare the listing for you.'
        : 'No — clear phone photos work fine. Good light and a tidy room matter more than equipment.',
    },
    {
      q: 'Who talks to the tenants?',
      a: 'You do, directly. Your verified phone number and WhatsApp appear on the listing — there is no middleman and we never sit between you and a tenant.',
    },
    {
      q: 'I already posted on ikman or Facebook. Why list here too?',
      a: 'It costs nothing and reaches renters who specifically want verified, scam-free listings. Your listing stays active for 30 days with no daily re-posting, and verification badges make your property stand out.',
    },
    {
      q: 'How long until my listing goes live?',
      a: 'After our team verifies it — we call or WhatsApp you to confirm the details first. Verified listings earn a badge tenants can trust.',
    },
    {
      q: 'Can I list more than one property?',
      a: 'Yes — unlimited properties, all free. Agencies and portfolio landlords can also get a business account to manage listings as a team.',
    },
  ];
  if (conciergeAvailable) {
    faqs.push({
      q: 'Can you create the listing for me?',
      a: 'Yes. WhatsApp us 6 photos and the address, and our team prepares and publishes the listing for you — free.',
    });
  }
  return faqs;
}

// Flag-gated page — copy and sections must reflect back-office toggles
// without a rebuild.
export const dynamic = 'force-dynamic';

export default async function ListYourPropertyPage() {
  const user = await getUser();
  const founding = isFeatureEnabled('showFoundingStageCopy');
  const quickListEnabled = isFeatureEnabled('enableQuickList');
  const conciergeAvailable =
    isFeatureEnabled('enableWhatsAppConcierge') && !!getConciergeWhatsAppLink();

  // Where every "list your property" CTA on this page is ultimately headed.
  const listingFormHref = quickListEnabled
    ? '/dashboard/listings/new?mode=quick'
    : '/dashboard/listings/new';
  const primaryCtaHref = accountGatedHref(!!user, listingFormHref);

  const faqs = buildFaqs(conciergeAvailable);
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <main>
        {/* Hero — matches landing page style but landlord-focused */}
        <section
          className="hero-bg relative overflow-hidden -mt-16 pt-16"
          style={{
            backgroundColor: '#062C2B',
            backgroundImage: [
              'radial-gradient(circle at 20% 50%, rgba(15,92,90,0.30) 0%, transparent 50%)',
              'radial-gradient(circle at 80% 20%, rgba(201,138,0,0.12) 0%, transparent 50%)',
              'radial-gradient(circle at 50% 80%, rgba(46,125,91,0.12) 0%, transparent 50%)',
              'linear-gradient(135deg, #062C2B 0%, #0A3F3D 35%, #083432 65%, #051F1E 100%)',
            ].join(', '),
          }}
        >
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-teal-600/20 rounded-full blur-3xl pointer-events-none animate-drift-slow" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-teal-500/15 rounded-full blur-3xl pointer-events-none animate-drift" />
          <div className="absolute inset-0 dot-pattern opacity-40 pointer-events-none" />

          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28 text-center hero-enter">
            <div className="flex justify-center mb-6">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold bg-teal-500/25 text-teal-200 border border-teal-400/35 backdrop-blur-sm">
                <Shield className="h-3.5 w-3.5" />
                For Landlords & Property Owners
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.08] tracking-tight mb-6">
              List Your Property on{' '}
              <span className="gradient-text">Easy Rent</span>
            </h1>
            <p className="text-lg sm:text-xl text-slate-200 max-w-2xl mx-auto leading-relaxed mb-10">
              {founding
                ? 'Free to list, checked before it goes live, and tenants contact you directly. No middlemen, no commissions.'
                : 'Reach tenants looking for mid-to-long-term rentals in Sri Lanka. Free to list, hassle-free management.'}
            </p>

            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href={primaryCtaHref}
                className="btn-primary-gradient inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-white font-semibold text-base shadow-xl shadow-teal-800/25"
              >
                {user ? 'List Your Property' : 'Get Started Free'}
                <ArrowRight className="h-5 w-5" />
              </Link>
              {conciergeAvailable && (
                <WhatsAppConciergeButton
                  variant="dark"
                  source="from list-your-property hero"
                  label="WhatsApp us 6 photos — we list it for you"
                  className="px-8 py-3.5 rounded-xl text-base"
                />
              )}
              {/* Only for visitors who might not have an account yet. */}
              {!user && (
                <Link
                  href="/sign-in"
                  className="px-8 py-3.5 rounded-xl text-slate-100 font-semibold text-base border border-white/30 hover:border-white/50 hover:text-white hover:bg-white/10 transition-all duration-200"
                >
                  Already have an account? Sign in
                </Link>
              )}
            </div>
          </div>

          {/* Bottom wave */}
          <div className="relative h-16 overflow-hidden">
            <svg
              viewBox="0 0 1440 64"
              fill="none"
              preserveAspectRatio="none"
              className="absolute bottom-0 w-full h-full"
            >
              <path
                d="M0 64L60 53.3C120 43 240 21 360 16C480 11 600 21 720 32C840 43 960 53 1080 53.3C1200 53 1320 43 1380 37.3L1440 32V64H1380C1320 64 1200 64 1080 64C960 64 840 64 720 64C600 64 480 64 360 64C240 64 120 64 60 64H0Z"
                fill="white"
              />
            </svg>
          </div>
        </section>

        {/* Two ways to list — collapses when both mechanisms are off */}
        {(quickListEnabled || conciergeAvailable) && (
          <section className="py-16 bg-white relative overflow-hidden">
            <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
              <ScrollReveal>
                <div className="text-center mb-10">
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight">
                    Two Ways to List —{' '}
                    <span className="gradient-text">Both Free</span>
                  </h2>
                  <p className="mt-3 text-lg text-slate-600 max-w-xl mx-auto">
                    Pick whichever is easier. Either way, we verify before it goes live.
                  </p>
                </div>
              </ScrollReveal>

              <ScrollReveal stagger className="grid md:grid-cols-2 gap-7">
                {quickListEnabled && (
                  <div className="bg-white rounded-2xl p-8 border border-slate-200/80 shadow-sm card-hover card-glow flex flex-col">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-600 to-teal-800 flex items-center justify-center shadow-md mb-5">
                      <Zap className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2">
                      The 60-second form
                    </h3>
                    <p className="text-slate-600 text-sm leading-relaxed flex-1 mb-6">
                      Six quick fields — title, city, address, bedrooms, rent, and
                      your phone number. We call or WhatsApp you to confirm the
                      details and photos before it goes live.
                    </p>
                    <Link
                      href={primaryCtaHref}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold shadow-md transition-colors"
                    >
                      Start the 60-second form
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                )}
                {conciergeAvailable && (
                  <div className="bg-white rounded-2xl p-8 border border-slate-200/80 shadow-sm card-hover card-glow flex flex-col">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center shadow-md mb-5">
                      <MessageCircle className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2">
                      The WhatsApp concierge
                    </h3>
                    <p className="text-slate-600 text-sm leading-relaxed flex-1 mb-6">
                      No forms at all. WhatsApp us 6 photos and the address — our
                      team prepares, verifies, and publishes the listing for you.
                      You just approve it.
                    </p>
                    <WhatsAppConciergeButton
                      variant="light"
                      source="from two-ways-to-list"
                      label="WhatsApp us your photos"
                      className="justify-center"
                    />
                  </div>
                )}
              </ScrollReveal>

              {/* Founding-offer strip — honest perks, no prices */}
              {founding && (
                <ScrollReveal>
                  <div className="mt-10 flex items-start sm:items-center gap-4 py-5 px-6 rounded-2xl bg-amber-50 border border-amber-200">
                    <Gift className="h-6 w-6 text-amber-700 shrink-0 mt-0.5 sm:mt-0" />
                    {/* Was: "free listings forever, and a free week of Featured
                        placement when featured spots launch." Two promises we
                        could not keep — a perpetual pricing commitment with no
                        record of who received it, and a giveaway of Featured,
                        which is the LKR 500 product the model actually sells.
                        Free LISTING is real and unlimited; free PLACEMENT is
                        the one thing that can never be promised. */}
                    <p className="text-sm text-amber-900">
                      <strong>Founding landlords:</strong> listing is free and
                      unlimited, and you deal with tenants directly by phone or
                      WhatsApp. Early landlords set the standard — and help us
                      decide what gets built next.
                    </p>
                  </div>
                </ScrollReveal>
              )}
            </div>
          </section>
        )}

        {/* Benefits — KeyDifferentiators style */}
        <section className="py-20 bg-[#F7F4ED] relative overflow-hidden">
          <div className="absolute inset-0 dot-pattern opacity-30 pointer-events-none" />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollReveal>
              <div className="text-center mb-14">
                <span className="inline-block px-3 py-1 text-xs font-semibold tracking-widest text-teal-800 bg-teal-50 border border-teal-200 rounded-full uppercase mb-4">
                  Why List With Us
                </span>
                <h2 className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight">
                  We Make Listing{' '}
                  <span className="gradient-text">Effortless</span>
                </h2>
                <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
                  From verification to viewing coordination — we handle the heavy lifting so you can focus on finding the right tenant.
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal stagger className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {benefits.map((benefit) => {
                const Icon = benefit.icon;
                return (
                  <div
                    key={benefit.title}
                    className="group bg-white rounded-2xl p-7 border border-slate-200/80 card-hover card-glow shadow-sm"
                  >
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${benefit.gradient} flex items-center justify-center mb-5 shadow-md group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <span className={`inline-block px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-full border mb-3 ${benefit.tagColor}`}>
                      {benefit.tag}
                    </span>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">{benefit.title}</h3>
                    <p className="text-slate-600 text-sm leading-relaxed">{benefit.description}</p>
                  </div>
                );
              })}
            </ScrollReveal>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 lg:py-28 bg-white overflow-hidden">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollReveal>
              <div className="text-center mb-16">
                <span className="inline-block px-3 py-1 text-xs font-semibold tracking-widest text-teal-800 bg-teal-50 border border-teal-200 rounded-full uppercase mb-4">
                  Simple Process
                </span>
                <h2 className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight">
                  How It Works for{' '}
                  <span className="gradient-text">Landlords</span>
                </h2>
                <p className="mt-4 text-lg text-slate-600 max-w-xl mx-auto">
                  Four straightforward steps — no middlemen, no hidden fees.
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal stagger className="space-y-8">
              {buildSteps(!!user).map((step) => (
                <div key={step.number} className="flex gap-6 items-start">
                  <div className="flex-shrink-0 w-14 h-14 bg-gradient-to-br from-teal-600 to-teal-800 text-white rounded-2xl flex items-center justify-center text-xl font-bold shadow-lg shadow-teal-800/20">
                    {step.number}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 mb-1">{step.title}</h3>
                    <p className="text-slate-600">{step.description}</p>
                  </div>
                </div>
              ))}
            </ScrollReveal>
          </div>
        </section>

        {/* FAQ — objection handling */}
        <section className="py-20 bg-[#F7F4ED] relative overflow-hidden">
          <div className="absolute inset-0 dot-pattern opacity-20 pointer-events-none" />
          <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollReveal>
              <div className="text-center mb-12">
                <span className="inline-block px-3 py-1 text-xs font-semibold tracking-widest text-amber-700 bg-amber-50 border border-amber-200 rounded-full uppercase mb-4">
                  Common Questions
                </span>
                <h2 className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight">
                  Before You <span className="gradient-text">Ask</span>
                </h2>
              </div>
            </ScrollReveal>

            <ScrollReveal>
              <div className="space-y-3">
                {faqs.map((faq) => (
                  <details
                    key={faq.q}
                    className="group bg-white rounded-2xl border border-slate-200/80 shadow-sm open:shadow-md transition-shadow"
                  >
                    <summary className="cursor-pointer select-none list-none px-6 py-4 flex items-center justify-between gap-4 text-slate-900 font-semibold">
                      {faq.q}
                      <span className="text-teal-700 transition-transform duration-200 group-open:rotate-45 text-xl leading-none">
                        +
                      </span>
                    </summary>
                    <p className="px-6 pb-5 text-slate-600 text-sm leading-relaxed">
                      {faq.a}
                    </p>
                  </details>
                ))}
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* CTA */}
        <section
          className="py-20"
          style={{
            backgroundColor: '#062C2B',
            backgroundImage: 'linear-gradient(135deg, #062C2B 0%, #0A3F3D 35%, #083432 65%, #051F1E 100%)',
          }}
        >
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <ScrollReveal>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
                Ready to Find Your Next Tenant?
              </h2>
              <p className="text-slate-300 mb-8 text-lg max-w-xl mx-auto">
                {founding
                  ? "Be one of the first landlords on Sri Lanka's most transparent rental platform — free, checked, direct."
                  : 'Manage your listings in one place and let qualified tenants contact you directly.'}
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Link
                  href={primaryCtaHref}
                  className="btn-amber-gradient inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-white font-semibold text-base shadow-xl shadow-amber-800/25"
                >
                  <CheckCircle className="h-5 w-5" />
                  List Your Property Now
                </Link>
                {conciergeAvailable && (
                  <WhatsAppConciergeButton
                    variant="dark"
                    source="from list-your-property footer CTA"
                    label="Or WhatsApp us your photos"
                    className="px-8 py-3.5 rounded-xl text-base"
                  />
                )}
              </div>
            </ScrollReveal>
          </div>
        </section>
      </main>

      <SiteFooter variant="landlord" />
    </>
  );
}
