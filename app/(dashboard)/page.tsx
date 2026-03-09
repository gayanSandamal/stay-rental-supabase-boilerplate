import { Suspense } from 'react';
import Link from 'next/link';
import { HeroSection } from '@/components/hero-section';
import { TrustSignals } from '@/components/trust-signals';
import { KeyDifferentiators } from '@/components/key-differentiators';
import { HowItWorks } from '@/components/how-it-works';
import { Testimonials } from '@/components/testimonials';
import { ShieldCheck, Mail, Phone } from 'lucide-react';

const FOOTER_LINKS = {
  Renters: [
    { href: '/listings', label: 'Browse Listings' },
    { href: '/listings?type=apartment', label: 'Apartments' },
    { href: '/listings?type=house', label: 'Houses' },
    { href: '/listings?type=room', label: 'Rooms' },
  ],
  Landlords: [
    { href: '/list-your-property', label: 'List Your Property' },
    { href: '/sign-in', label: 'Landlord Login' },
    { href: '/dashboard', label: 'Manage Listings' },
  ],
  Company: [
    { href: '/#how-it-works', label: 'How It Works' },
    { href: '/sign-in', label: 'Sign In' },
    { href: '/sign-up', label: 'Create Account' },
  ],
};

function SiteFooter() {
  return (
    <footer
      className="hero-bg text-white"
      style={{
        backgroundColor: '#062C2B',
        backgroundImage: 'linear-gradient(135deg, #062C2B 0%, #0A3F3D 35%, #083432 65%, #051F1E 100%)',
      }}
    >
      {/* CTA strip */}
      <div className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 flex flex-col lg:flex-row items-center justify-between gap-8">
          <div>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-white leading-snug">
              Ready to find your{' '}
              <span className="gradient-text-gold">perfect home?</span>
            </h3>
            <p className="text-slate-400 mt-2 text-base max-w-md">
              Join thousands of tenants who found verified, scam-free rentals through Stay Rental.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <Link
              href="/listings"
              className="btn-primary-gradient px-6 py-3 rounded-xl text-white font-semibold text-sm"
            >
              Browse Listings
            </Link>
            <Link
              href="/list-your-property"
              className="btn-amber-gradient px-6 py-3 rounded-xl text-white font-semibold text-sm"
            >
              List Your Property
            </Link>
          </div>
        </div>
      </div>

      {/* Links grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-700 to-teal-900 flex items-center justify-center shadow-lg shadow-teal-800/30">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white">
                  <path d="M3 9.5L12 3l9 6.5V21H3V9.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="rgba(255,255,255,0.2)" />
                  <rect x="9" y="14" width="6" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
                </svg>
              </div>
              <span className="text-lg font-bold">Stay<span className="text-teal-400">Rental</span></span>
            </Link>
            <p className="text-slate-400 text-sm leading-relaxed mb-5 max-w-xs">
              Sri Lanka&apos;s trusted platform for verified mid-to-long-term rentals. No scams. No surprises.
            </p>
            <div className="flex items-center gap-2 text-xs text-emerald-400 mb-2">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>100% KYC Verified Landlords</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Mail className="h-3.5 w-3.5" />
              <span>hello@stayrental.lk</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
              <Phone className="h-3.5 w-3.5" />
              <span>+94 77 000 0000</span>
            </div>
          </div>

          {/* Links */}
          {Object.entries(FOOTER_LINKS).map(([group, links]) => (
            <div key={group}>
              <h4 className="text-xs font-bold tracking-widest text-slate-300 uppercase mb-4">{group}</h4>
              <ul className="space-y-2.5">
                {links.map(({ href, label }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="text-sm text-slate-400 hover:text-white transition-colors duration-200"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} Stay Rental (Pvt) Ltd. All rights reserved.</span>
          <div className="flex gap-5">
            <span className="hover:text-slate-300 cursor-pointer transition-colors">Privacy Policy</span>
            <span className="hover:text-slate-300 cursor-pointer transition-colors">Terms of Service</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default async function HomePage() {
  return (
    <>
      <main>
        <HeroSection />

        <Suspense fallback={
          <div className="py-14 bg-white">
            <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 lg:grid-cols-4 gap-5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          </div>
        }>
          <TrustSignals />
        </Suspense>

        <KeyDifferentiators />
        <HowItWorks />
        <Testimonials />
      </main>

      <SiteFooter />
    </>
  );
}
