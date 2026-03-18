import Link from 'next/link';
import {
  Home,
  Building2,
  Search,
  Phone,
  MessageCircle,
  Bell,
  Zap,
  ArrowRight,
  FileText,
  Shield,
  Eye,
  BookOpen,
  ChevronRight,
  LogIn,
  UserPlus,
} from 'lucide-react';
import { ScrollReveal } from '@/components/scroll-reveal';
import { SiteFooter } from '@/components/site-footer';
import type { Metadata } from 'next';
import {
  SearchHousesIllustration,
  ViewDetailsIllustration,
  ContactLandlordIllustration,
  SaveAlertsIllustration,
  PremiumIllustration,
  CreateAccountIllustration,
  AddPropertyIllustration,
  VerificationIllustration,
  ManageListingIllustration,
  TenantsContactIllustration,
  BoostVisibilityIllustration,
} from './step-illustrations';
import type { ComponentType, ReactNode } from 'react';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://easyrent.lk';

export const metadata: Metadata = {
  title: 'How to Use Easy Rent',
  description:
    "Learn how to find rentals as a renter or list your property as a landlord on Easy Rent. Simple step-by-step guides for Sri Lanka's verified rental platform.",
  alternates: {
    canonical: `${baseUrl}/how-to-use`,
  },
};

type Step = {
  num: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  optional: boolean;
  illustration: () => ReactNode;
};

const RENTER_STEPS: Step[] = [
  {
    num: '1',
    title: 'Find a rental',
    description:
      'Go to the homepage or click Browse Listings. Filter by city, property type, bedrooms, price range, power backup, water source, and fiber internet.',
    icon: Search,
    optional: false,
    illustration: SearchHousesIllustration,
  },
  {
    num: '2',
    title: 'View listing details',
    description:
      'Click any listing card to see full details: photos, description, location, amenities, monthly rent, deposit, and Sri Lanka-specific features.',
    icon: Eye,
    optional: false,
    illustration: ViewDetailsIllustration,
  },
  {
    num: '3',
    title: 'Contact the landlord directly',
    description:
      'Call or WhatsApp the landlord using the numbers shown on the listing. No account required. You coordinate directly with them.',
    icon: Phone,
    optional: false,
    illustration: ContactLandlordIllustration,
  },
  {
    num: '4',
    title: 'Save searches & get alerts',
    description:
      'Sign up for a free account to save up to 3 searches and get email alerts when new listings match your criteria.',
    icon: Bell,
    optional: true,
    illustration: SaveAlertsIllustration,
  },
  {
    num: '5',
    title: 'Go Premium for early access',
    description:
      'Upgrade for a 24-hour head start on new listings, exclusive listings, and unlimited saved alerts.',
    icon: Zap,
    optional: true,
    illustration: PremiumIllustration,
  },
];

const LANDLORD_STEPS: Step[] = [
  {
    num: '1',
    title: 'Create an account',
    description:
      'Sign up at List Your Property or Create Account. Enter your email and password to get started.',
    icon: FileText,
    optional: false,
    illustration: CreateAccountIllustration,
  },
  {
    num: '2',
    title: 'Add your property',
    description:
      'Go to Dashboard → Listings → New Listing. Fill in property details, location, rent, deposit, photos, and your contact numbers.',
    icon: Building2,
    optional: false,
    illustration: AddPropertyIllustration,
  },
  {
    num: '3',
    title: 'Verification',
    description:
      'Our team reviews your listing and may visit the property. Once approved, it goes live and appears in search results.',
    icon: Shield,
    optional: false,
    illustration: VerificationIllustration,
  },
  {
    num: '4',
    title: 'Manage your listing',
    description:
      'View status, edit details, and renew when your listing expires (30 days). Mark as rented when you find a tenant.',
    icon: Eye,
    optional: false,
    illustration: ManageListingIllustration,
  },
  {
    num: '5',
    title: 'Tenants contact you',
    description:
      'Renters see your phone and WhatsApp on your listing and contact you directly to arrange viewings.',
    icon: Phone,
    optional: false,
    illustration: TenantsContactIllustration,
  },
  {
    num: '6',
    title: 'Boost visibility',
    description:
      'Boost (LKR 250/7 days), Featured (LKR 500/7 days), or Urgent (LKR 150/7 days) add-ons help your listing stand out. Contact support after payment to activate.',
    icon: Zap,
    optional: true,
    illustration: BoostVisibilityIllustration,
  },
];

export default function HowToUsePage() {
  return (
    <>
      {/* ── Keyframe animations ── */}
      <style>{`
        @keyframes htx-line-grow {
          from { transform: scaleY(0); transform-origin: top; }
          to   { transform: scaleY(1); transform-origin: top; }
        }
        @keyframes htx-step-in {
          from { opacity: 0; transform: scale(0.6); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes htx-content-in {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes htx-pulse-ring {
          0%   { box-shadow: 0 0 0 0 rgba(15,92,90,0.45); }
          70%  { box-shadow: 0 0 0 9px rgba(15,92,90,0); }
          100% { box-shadow: 0 0 0 0 rgba(15,92,90,0); }
        }
        @keyframes htx-pulse-ring-amber {
          0%   { box-shadow: 0 0 0 0 rgba(245,158,11,0.45); }
          70%  { box-shadow: 0 0 0 9px rgba(245,158,11,0); }
          100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); }
        }
        @keyframes htx-dash {
          to { stroke-dashoffset: 0; }
        }
        @keyframes htx-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-6px); }
        }
        @keyframes htx-spin-slow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes htx-search-pop {
          0%,100% { transform: scale(1) rotate(-8deg); }
          50%     { transform: scale(1.12) rotate(-8deg); }
        }
        @keyframes htx-check-draw {
          from { stroke-dashoffset: 30; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes htx-illus-in {
          from { opacity: 0; transform: translateY(6px) scale(0.92); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        .htx-step-bubble {
          --d: 0s;
          opacity: 0;
          animation: htx-step-in 0.35s cubic-bezier(.34,1.56,.64,1) var(--d) forwards;
        }
        .htx-step-bubble.htx-pulse-teal {
          animation: htx-step-in 0.35s cubic-bezier(.34,1.56,.64,1) var(--d) forwards,
                     htx-pulse-ring 2.4s ease-in-out 0.5s infinite;
        }
        .htx-step-bubble.htx-pulse-amber {
          animation: htx-step-in 0.35s cubic-bezier(.34,1.56,.64,1) var(--d) forwards,
                     htx-pulse-ring-amber 2.4s ease-in-out 0.5s infinite;
        }
        .htx-step-content {
          --d: 0s;
          opacity: 0;
          animation: htx-content-in 0.35s ease var(--d) forwards;
        }
        .htx-connector {
          --d: 0s;
          transform: scaleY(0);
          transform-origin: top;
          animation: htx-line-grow 0.4s ease var(--d) forwards;
        }
        .htx-illus {
          --d: 0s;
          opacity: 0;
          animation: htx-illus-in 0.45s ease var(--d) forwards;
        }
      `}</style>

      <main>
        {/* ── Hero ── */}
        <section
          className="hero-bg relative overflow-hidden -mt-16 pt-16"
          style={{
            backgroundColor: '#062C2B',
            backgroundImage: [
              'radial-gradient(circle at 20% 50%, rgba(15,92,90,0.30) 0%, transparent 50%)',
              'radial-gradient(circle at 80% 30%, rgba(201,138,0,0.12) 0%, transparent 50%)',
              'radial-gradient(circle at 50% 80%, rgba(46,125,91,0.12) 0%, transparent 50%)',
              'linear-gradient(135deg, #062C2B 0%, #0A3F3D 35%, #083432 65%, #051F1E 100%)',
            ].join(', '),
          }}
        >
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-teal-600/20 rounded-full blur-3xl pointer-events-none animate-drift-slow" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-teal-500/15 rounded-full blur-3xl pointer-events-none animate-drift" />
          <div className="absolute top-1/2 right-1/3 w-60 h-60 bg-amber-500/10 rounded-full blur-3xl pointer-events-none animate-drift-fast" />
          <div className="absolute inset-0 dot-pattern opacity-40 pointer-events-none" />

          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24 text-center hero-enter">
            <div className="flex justify-center mb-6">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold bg-teal-500/25 text-teal-200 border border-teal-400/35 backdrop-blur-sm">
                <BookOpen className="h-3.5 w-3.5" />
                Step-by-Step Guides
              </span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.08] tracking-tight mb-5">
              How to Use{' '}
              <span className="gradient-text">Easy Rent</span>
            </h1>
            <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed mb-12">
              Simple guides for renters and landlords. No middlemen, no fees to list — just connect directly.
            </p>

            {/* ── Animated SVG platform illustration ── */}
            <div className="flex justify-center mb-12">
              <svg
                viewBox="0 0 520 130"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full max-w-lg"
                aria-hidden="true"
              >
                {/* Renter side — house */}
                <rect x="28" y="58" width="56" height="42" rx="4" fill="rgba(15,92,90,0.25)" stroke="#3A9E98" strokeWidth="1.5" />
                <path d="M20 62 L56 32 L92 62" stroke="#3A9E98" strokeWidth="2" strokeLinejoin="round" fill="rgba(15,92,90,0.15)" />
                <rect x="47" y="76" width="18" height="24" rx="2" fill="rgba(15,92,90,0.4)" stroke="#3A9E98" strokeWidth="1" />
                <rect x="32" y="66" width="14" height="12" rx="2" fill="rgba(15,92,90,0.3)" stroke="#3A9E98" strokeWidth="1" />
                <g style={{ animation: 'htx-search-pop 2.8s ease-in-out infinite', transformOrigin: '85px 48px' }}>
                  <circle cx="82" cy="42" r="11" stroke="#5ECCC8" strokeWidth="2" fill="rgba(94,204,200,0.1)" />
                  <line x1="90" y1="51" x2="97" y2="59" stroke="#5ECCC8" strokeWidth="2.5" strokeLinecap="round" />
                </g>
                <text x="56" y="118" textAnchor="middle" fill="#5ECCC8" fontSize="10" fontWeight="600" fontFamily="system-ui,sans-serif">Renter</text>

                {/* Center platform node */}
                <circle cx="260" cy="58" r="28" fill="rgba(15,92,90,0.3)" stroke="#3A9E98" strokeWidth="1.5" />
                <circle cx="260" cy="58" r="21" fill="rgba(10,63,61,0.6)" stroke="#3A9E98" strokeWidth="1" />
                <text x="260" y="63" textAnchor="middle" fill="#7DD8D5" fontSize="13" fontWeight="800" fontFamily="system-ui,sans-serif">ER</text>
                <circle
                  cx="260" cy="58" r="34"
                  stroke="#3A9E98" strokeWidth="1" strokeDasharray="8 6" fill="none"
                  style={{ animation: 'htx-spin-slow 12s linear infinite', transformOrigin: '260px 58px' }}
                />
                <text x="260" y="103" textAnchor="middle" fill="#5ECCC8" fontSize="10" fontWeight="600" fontFamily="system-ui,sans-serif">Easy Rent</text>

                {/* Landlord side — building */}
                <rect x="436" y="40" width="56" height="60" rx="3" fill="rgba(180,100,0,0.2)" stroke="#F59E0B" strokeWidth="1.5" />
                <rect x="443" y="48" width="10" height="10" rx="1.5" fill="rgba(245,158,11,0.3)" stroke="#F59E0B" strokeWidth="1" />
                <rect x="459" y="48" width="10" height="10" rx="1.5" fill="rgba(245,158,11,0.3)" stroke="#F59E0B" strokeWidth="1" />
                <rect x="475" y="48" width="10" height="10" rx="1.5" fill="rgba(245,158,11,0.3)" stroke="#F59E0B" strokeWidth="1" />
                <rect x="443" y="64" width="10" height="10" rx="1.5" fill="rgba(245,158,11,0.3)" stroke="#F59E0B" strokeWidth="1" />
                <rect x="459" y="64" width="10" height="10" rx="1.5" fill="rgba(245,158,11,0.3)" stroke="#F59E0B" strokeWidth="1" />
                <rect x="475" y="64" width="10" height="10" rx="1.5" fill="rgba(245,158,11,0.3)" stroke="#F59E0B" strokeWidth="1" />
                <rect x="455" y="80" width="18" height="20" rx="2" fill="rgba(180,100,0,0.4)" stroke="#F59E0B" strokeWidth="1" />
                <g style={{ animation: 'htx-float 3s ease-in-out infinite', transformOrigin: '422px 36px' }}>
                  <circle cx="422" cy="36" r="13" fill="rgba(10,63,61,0.9)" stroke="#3A9E98" strokeWidth="1.5" />
                  <path
                    d="M415 36 L419.5 41 L429 31"
                    stroke="#4ADE80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"
                    strokeDasharray="30"
                    style={{ animation: 'htx-check-draw 0.6s ease 0.8s forwards', strokeDashoffset: 30 }}
                  />
                </g>
                <text x="464" y="118" textAnchor="middle" fill="#F59E0B" fontSize="10" fontWeight="600" fontFamily="system-ui,sans-serif">Landlord</text>

                {/* Connecting paths + traveling dots */}
                <path id="path-r" d="M100 62 Q160 58 228 58" stroke="#3A9E98" strokeWidth="1.5"
                  strokeDasharray="200" strokeDashoffset="200" fill="none"
                  style={{ animation: 'htx-dash 1.2s ease 0.3s forwards' }}
                />
                <circle r="4" fill="#5ECCC8" opacity="0">
                  <animateMotion dur="2.5s" repeatCount="indefinite" begin="1.5s"><mpath href="#path-r" /></animateMotion>
                  <animate attributeName="opacity" values="0;1;1;0" dur="2.5s" repeatCount="indefinite" begin="1.5s" />
                </circle>
                <path id="path-l" d="M292 58 Q360 58 432 58" stroke="#F59E0B" strokeWidth="1.5"
                  strokeDasharray="200" strokeDashoffset="200" fill="none"
                  style={{ animation: 'htx-dash 1.2s ease 0.6s forwards' }}
                />
                <circle r="4" fill="#F59E0B" opacity="0">
                  <animateMotion dur="2.5s" repeatCount="indefinite" begin="2s"><mpath href="#path-l" /></animateMotion>
                  <animate attributeName="opacity" values="0;1;1;0" dur="2.5s" repeatCount="indefinite" begin="2s" />
                </circle>
              </svg>
            </div>

            {/* Dual-path jump cards */}
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href="#for-renters"
                className="group flex flex-col items-center gap-3 px-8 py-5 rounded-2xl border border-white/15 bg-white/5 hover:bg-teal-500/15 hover:border-teal-400/40 transition-all duration-300 w-44"
              >
                <div className="w-12 h-12 rounded-2xl bg-teal-500/30 flex items-center justify-center group-hover:scale-110 group-hover:bg-teal-500/50 transition-all duration-300">
                  <Home className="h-6 w-6 text-teal-300" />
                </div>
                <div>
                  <span className="block text-sm font-bold text-teal-200">For Renters</span>
                  <span className="block text-xs text-slate-400 mt-0.5 group-hover:text-teal-300 transition-colors">Find your home →</span>
                </div>
              </Link>
              <Link
                href="#for-landlords"
                className="group flex flex-col items-center gap-3 px-8 py-5 rounded-2xl border border-white/15 bg-white/5 hover:bg-amber-500/15 hover:border-amber-400/40 transition-all duration-300 w-44"
              >
                <div className="w-12 h-12 rounded-2xl bg-amber-500/30 flex items-center justify-center group-hover:scale-110 group-hover:bg-amber-500/50 transition-all duration-300">
                  <Building2 className="h-6 w-6 text-amber-300" />
                </div>
                <div>
                  <span className="block text-sm font-bold text-amber-200">For Landlords</span>
                  <span className="block text-xs text-slate-400 mt-0.5 group-hover:text-amber-300 transition-colors">List your property →</span>
                </div>
              </Link>
            </div>
          </div>

          {/* Bottom wave */}
          <div className="relative h-16 overflow-hidden">
            <svg viewBox="0 0 1440 64" fill="none" preserveAspectRatio="none" className="absolute bottom-0 w-full h-full">
              <path d="M0 64L60 53.3C120 43 240 21 360 16C480 11 600 21 720 32C840 43 960 53 1080 53.3C1200 53 1320 43 1380 37.3L1440 32V64H1380C1320 64 1200 64 1080 64C960 64 840 64 720 64C600 64 480 64 360 64C240 64 120 64 60 64H0Z" fill="#F7F4ED" />
            </svg>
          </div>
        </section>

        {/* ── Guides ── */}
        <section className="py-20 bg-[#F7F4ED] relative overflow-hidden">
          <div className="absolute inset-0 dot-pattern opacity-20 pointer-events-none" />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

            <ScrollReveal>
              <div className="text-center mb-16">
                <span className="inline-block px-3 py-1 text-xs font-semibold tracking-widest text-teal-800 bg-teal-50 border border-teal-200 rounded-full uppercase mb-4">
                  Quick Guides
                </span>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight">
                  Two Simple{' '}
                  <span className="gradient-text">Journeys</span>
                </h2>
                <p className="mt-4 text-lg text-slate-600 max-w-xl mx-auto">
                  Pick your path and follow the steps below.
                </p>
              </div>
            </ScrollReveal>

            <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">

              {/* ── For Renters ── */}
              <ScrollReveal>
                <div
                  id="for-renters"
                  className="scroll-mt-24 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl transition-shadow duration-300 overflow-hidden card-hover"
                >
                  {/* Header */}
                  <div className="bg-gradient-to-br from-teal-600 to-teal-800 px-7 py-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center" style={{ animation: 'htx-float 4s ease-in-out infinite' }}>
                        <Home className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-white">For Renters</h2>
                        <p className="text-sm text-teal-100/80">Find verified rentals, no middlemen</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[
                        { Icon: Search, label: 'Search' },
                        { Icon: Eye, label: 'View' },
                        { Icon: Phone, label: 'Contact' },
                        { Icon: Home, label: 'Move in' },
                      ].map((item, i) => (
                        <div key={item.label} className="flex items-center gap-1.5">
                          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-teal-300/60 shrink-0" />}
                          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/15 backdrop-blur-sm">
                            <item.Icon className="h-3.5 w-3.5 text-teal-100" />
                            <span className="text-xs font-semibold text-teal-100">{item.label}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Timeline with illustrations */}
                  <div className="px-7 py-7">
                    <ol className="space-y-0">
                      {RENTER_STEPS.map((step, idx) => {
                        const Illus = step.illustration;
                        const isLast = idx === RENTER_STEPS.length - 1;
                        const delay = `${0.1 + idx * 0.15}s`;
                        return (
                          <li key={step.num} className="relative flex gap-4">
                            {/* Connector */}
                            {!isLast && (
                              <div
                                className="htx-connector absolute left-[19px] top-10 bottom-0 w-px bg-gradient-to-b from-teal-200 to-teal-100"
                                style={{ '--d': delay } as React.CSSProperties}
                              />
                            )}
                            {/* Bubble */}
                            <div className="flex-shrink-0 relative z-10 mt-0.5">
                              <div
                                className={`htx-step-bubble w-10 h-10 rounded-full flex items-center justify-center border-2 text-sm font-bold ${
                                  step.optional
                                    ? 'bg-teal-50 border-teal-200 text-teal-500'
                                    : 'bg-teal-600 border-teal-700 text-white htx-pulse-teal'
                                }`}
                                style={{ '--d': delay } as React.CSSProperties}
                              >
                                <span className="font-mono text-sm font-bold">{step.num}</span>
                              </div>
                            </div>
                            {/* Content + illustration */}
                            <div
                              className="htx-step-content min-w-0 flex-1 pb-7"
                              style={{ '--d': `${parseFloat(delay) + 0.05}s` } as React.CSSProperties}
                            >
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h3 className="font-semibold text-slate-900 text-[15px]">{step.title}</h3>
                                {step.optional && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-50 text-teal-600 border border-teal-200">
                                    Optional
                                  </span>
                                )}
                              </div>
                              <div className="flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-slate-600 leading-relaxed">{step.description}</p>
                                </div>
                                {/* Animated illustration */}
                                <div
                                  className="htx-illus hidden sm:block flex-shrink-0 w-[72px] h-[64px] rounded-xl bg-teal-50/60 border border-teal-100/80 overflow-hidden"
                                  style={{ '--d': `${parseFloat(delay) + 0.15}s` } as React.CSSProperties}
                                >
                                  <Illus />
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>

                    <div className="pt-2">
                      <Link
                        href="/listings"
                        className="inline-flex items-center gap-2 btn-primary-gradient px-5 py-3 rounded-xl text-white font-semibold text-sm shadow-md shadow-teal-800/20 hover:gap-3 transition-all"
                      >
                        Browse Listings
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              </ScrollReveal>

              {/* ── For Landlords ── */}
              <ScrollReveal>
                <div
                  id="for-landlords"
                  className="scroll-mt-24 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl transition-shadow duration-300 overflow-hidden card-hover"
                >
                  {/* Header */}
                  <div className="bg-gradient-to-br from-amber-500 to-amber-700 px-7 py-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center" style={{ animation: 'htx-float 4s ease-in-out infinite 0.8s' }}>
                        <Building2 className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-white">For Landlords</h2>
                        <p className="text-sm text-amber-100/80">List free, verify once, tenants find you</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[
                        { Icon: FileText, label: 'Sign up' },
                        { Icon: Building2, label: 'Add' },
                        { Icon: Shield, label: 'Verify' },
                        { Icon: Phone, label: 'Get calls' },
                      ].map((item, i) => (
                        <div key={item.label} className="flex items-center gap-1.5">
                          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-amber-200/60 shrink-0" />}
                          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/15 backdrop-blur-sm">
                            <item.Icon className="h-3.5 w-3.5 text-amber-100" />
                            <span className="text-xs font-semibold text-amber-100">{item.label}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Timeline with illustrations */}
                  <div className="px-7 py-7">
                    <ol className="space-y-0">
                      {LANDLORD_STEPS.map((step, idx) => {
                        const Illus = step.illustration;
                        const isLast = idx === LANDLORD_STEPS.length - 1;
                        const delay = `${0.1 + idx * 0.15}s`;
                        return (
                          <li key={step.num} className="relative flex gap-4">
                            {/* Connector */}
                            {!isLast && (
                              <div
                                className="htx-connector absolute left-[19px] top-10 bottom-0 w-px bg-gradient-to-b from-amber-200 to-amber-100"
                                style={{ '--d': delay } as React.CSSProperties}
                              />
                            )}
                            {/* Bubble */}
                            <div className="flex-shrink-0 relative z-10 mt-0.5">
                              <div
                                className={`htx-step-bubble w-10 h-10 rounded-full flex items-center justify-center border-2 text-sm font-bold ${
                                  step.optional
                                    ? 'bg-amber-50 border-amber-200 text-amber-500'
                                    : 'bg-amber-500 border-amber-600 text-white htx-pulse-amber'
                                }`}
                                style={{ '--d': delay } as React.CSSProperties}
                              >
                                <span className="font-mono text-sm font-bold">{step.num}</span>
                              </div>
                            </div>
                            {/* Content + illustration */}
                            <div
                              className="htx-step-content min-w-0 flex-1 pb-7"
                              style={{ '--d': `${parseFloat(delay) + 0.05}s` } as React.CSSProperties}
                            >
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h3 className="font-semibold text-slate-900 text-[15px]">{step.title}</h3>
                                {step.optional && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-200">
                                    Optional
                                  </span>
                                )}
                              </div>
                              <div className="flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-slate-600 leading-relaxed">{step.description}</p>
                                </div>
                                {/* Animated illustration */}
                                <div
                                  className="htx-illus hidden sm:block flex-shrink-0 w-[72px] h-[64px] rounded-xl bg-amber-50/60 border border-amber-100/80 overflow-hidden"
                                  style={{ '--d': `${parseFloat(delay) + 0.15}s` } as React.CSSProperties}
                                >
                                  <Illus />
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>

                    <div className="pt-2">
                      <Link
                        href="/list-your-property"
                        className="inline-flex items-center gap-2 btn-amber-gradient px-5 py-3 rounded-xl text-white font-semibold text-sm shadow-md shadow-amber-800/20 hover:gap-3 transition-all"
                      >
                        List Your Property
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* ── Quick Links ── */}
        <section className="py-16 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollReveal>
              <div className="text-center mb-10">
                <span className="inline-block px-3 py-1 text-xs font-semibold tracking-widest text-slate-600 bg-slate-100 border border-slate-200 rounded-full uppercase mb-3">
                  Get Started
                </span>
                <h3 className="text-2xl font-bold text-slate-900">Jump right in</h3>
                <p className="mt-2 text-slate-500 text-sm">Go directly to where you need to be</p>
              </div>
            </ScrollReveal>
            <ScrollReveal>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Link
                  href="/listings"
                  className="group flex flex-col items-center gap-2.5 px-4 py-5 rounded-2xl bg-teal-50 border border-teal-100 hover:bg-teal-100 hover:border-teal-300 hover:shadow-md transition-all duration-200 text-center"
                >
                  <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Search className="h-5 w-5 text-white" />
                  </div>
                  <span className="font-semibold text-sm text-teal-900">Browse Listings</span>
                  <span className="text-xs text-teal-600/70">Find rentals now</span>
                </Link>
                <Link
                  href="/list-your-property"
                  className="group flex flex-col items-center gap-2.5 px-4 py-5 rounded-2xl bg-amber-50 border border-amber-100 hover:bg-amber-100 hover:border-amber-300 hover:shadow-md transition-all duration-200 text-center"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Building2 className="h-5 w-5 text-white" />
                  </div>
                  <span className="font-semibold text-sm text-amber-900">List Property</span>
                  <span className="text-xs text-amber-600/70">Free to list</span>
                </Link>
                <Link
                  href="/sign-up"
                  className="group flex flex-col items-center gap-2.5 px-4 py-5 rounded-2xl bg-slate-50 border border-slate-200 hover:bg-teal-50 hover:border-teal-200 hover:shadow-md transition-all duration-200 text-center"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-700 group-hover:bg-teal-700 flex items-center justify-center group-hover:scale-110 transition-all">
                    <UserPlus className="h-5 w-5 text-white" />
                  </div>
                  <span className="font-semibold text-sm text-slate-800">Create Account</span>
                  <span className="text-xs text-slate-500">Free sign up</span>
                </Link>
                <Link
                  href="/sign-in"
                  className="group flex flex-col items-center gap-2.5 px-4 py-5 rounded-2xl bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:shadow-md transition-all duration-200 text-center"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-200 group-hover:bg-slate-300 flex items-center justify-center group-hover:scale-110 transition-all">
                    <LogIn className="h-5 w-5 text-slate-600" />
                  </div>
                  <span className="font-semibold text-sm text-slate-800">Sign In</span>
                  <span className="text-xs text-slate-500">Existing users</span>
                </Link>
                <a
                  href="mailto:support@easyrent.lk"
                  className="group col-span-2 sm:col-span-1 flex flex-col items-center gap-2.5 px-4 py-5 rounded-2xl bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:shadow-md transition-all duration-200 text-center"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-200 group-hover:bg-teal-600 flex items-center justify-center group-hover:scale-110 transition-all">
                    <MessageCircle className="h-5 w-5 text-slate-600 group-hover:text-white transition-colors" />
                  </div>
                  <span className="font-semibold text-sm text-slate-800">Contact Support</span>
                  <span className="text-xs text-slate-500">We&apos;re here to help</span>
                </a>
              </div>
            </ScrollReveal>
          </div>
        </section>
      </main>
      <SiteFooter variant="default" />
    </>
  );
}
