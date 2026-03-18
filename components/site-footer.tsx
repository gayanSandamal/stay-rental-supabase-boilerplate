import Link from 'next/link';
import { ScrollReveal } from './scroll-reveal';
import { ShieldCheck, Mail, Phone, Gift } from 'lucide-react';

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
    { href: '/how-to-use', label: 'How to Use' },
    { href: '/sign-in', label: 'Sign In' },
    { href: '/sign-up', label: 'Create Account' },
  ],
};

type FooterVariant = 'default' | 'landlord';

interface SiteFooterProps {
  variant?: FooterVariant;
}

export function SiteFooter({ variant = 'default' }: SiteFooterProps) {
  const isLandlord = variant === 'landlord';

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
        <ScrollReveal>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 flex flex-col lg:flex-row items-center justify-between gap-8">
            <div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-white leading-snug">
                {isLandlord ? (
                  <>
                    Ready to find your{' '}
                    <span className="gradient-text-gold">next tenant?</span>
                  </>
                ) : (
                  <>
                    Ready to find your{' '}
                    <span className="gradient-text-gold">perfect home?</span>
                  </>
                )}
              </h3>
              <p className="text-slate-400 mt-2 text-base max-w-md">
                {isLandlord
                  ? 'Join hundreds of landlords who trust Easy Rent to manage their listings and find qualified tenants.'
                  : 'Join thousands of renters who found verified, affordable rentals through Easy Rent.'}
              </p>
              <p className="text-amber-300/90 mt-2 text-sm flex items-center gap-2">
                <Gift className="h-4 w-4" />
                Refer a friend — both get LKR 500 off.
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
        </ScrollReveal>
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
              <span className="text-lg font-bold">Easy<span className="text-teal-400">Rent</span></span>
            </Link>
            <p className="text-slate-400 text-sm leading-relaxed mb-5 max-w-xs">
              Sri Lanka&apos;s trusted, affordable platform for verified rentals. No scams. No surprises.
            </p>
            <div className="flex items-center gap-2 text-xs text-emerald-400 mb-2">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Verified Landlords & Listings</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Mail className="h-3.5 w-3.5" />
              <span>hello@easyrent.lk</span>
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
          <span>© {new Date().getFullYear()} Easy Rent (Pvt) Ltd. All rights reserved.</span>
          <div className="flex gap-5">
            <Link href="/privacy-policy" className="hover:text-slate-300 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms-of-service" className="hover:text-slate-300 transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
