'use client';

import Link from 'next/link';
import { Suspense, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Home, List, PlusCircle, BookOpen, Menu, X } from 'lucide-react';
import { UserMenu } from '@/components/user-menu';
import { NotificationCenter } from '@/components/notification-center';
import { EmailUnverifiedBanner } from '@/components/email-unverified-banner';
import { EasyRentMark } from '@/components/brand/easy-rent-logo';

const NAV_LINKS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/listings', label: 'Browse Listings', icon: List },
  { href: '/list-your-property', label: 'List Property', icon: PlusCircle },
  { href: '/how-to-use', label: 'How to Use', icon: BookOpen },
];

function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isHome = pathname === '/';
  const isHeroPage = isHome || pathname === '/how-to-use' || pathname === '/list-your-property';

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        isHeroPage && !scrolled
          ? 'bg-transparent border-b border-white/5'
          : 'bg-white/90 backdrop-blur-xl border-b border-gray-200/60 shadow-sm'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <EasyRentMark
              size={36}
              title="Easy Rent"
              className={`shrink-0 transition-transform duration-200 group-hover:scale-105 ${isHeroPage && !scrolled ? 'text-white' : 'text-teal-700'}`}
            />
            <div className="leading-none">
              <span className={`block text-[15px] font-semibold tracking-[0.2em] transition-colors duration-300 ${isHeroPage && !scrolled ? 'text-white' : 'text-slate-900'}`}>
                EASY RENT
              </span>
              <span className={`hidden sm:block mt-1 text-[9px] font-medium tracking-[0.22em] leading-none transition-colors duration-300 ${isHeroPage && !scrolled ? 'text-white/55' : 'text-slate-500'}`}>
                VERIFIED RENTALS · SRI LANKA
              </span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    active
                      ? 'bg-teal-800 text-white shadow-md shadow-teal-800/30'
                      : isHeroPage && !scrolled
                      ? 'text-white/80 hover:text-white hover:bg-white/10'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <Suspense fallback={<div className="h-9 w-24 bg-slate-200 rounded-lg animate-pulse" />}>
              <NotificationCenter />
            </Suspense>
            <Suspense fallback={<div className="h-9 w-24 bg-slate-200 rounded-lg animate-pulse" />}>
              <UserMenu />
            </Suspense>
            {/* Mobile menu toggle */}
            <button
              className={`md:hidden p-2 rounded-lg transition-colors ${isHeroPage && !scrolled ? 'text-white hover:bg-white/10' : 'text-slate-600 hover:bg-slate-100'}`}
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav Drawer */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 shadow-lg px-4 py-3 flex flex-col gap-1">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? 'bg-teal-50 text-teal-800'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col min-h-screen">
      <Header />
      <EmailUnverifiedBanner />
      {children}
    </section>
  );
}
