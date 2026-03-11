'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, MapPin, ArrowRight, ShieldCheck, Zap, Building2, Clock } from 'lucide-react';
import { SearchInputWithSuggestions } from '@/components/search-input-with-suggestions';

const POPULAR = ['Colombo 3', 'Nugegoda', 'Kandy', 'Galle', 'Negombo', 'Battaramulla'];

function FloatingCard({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  className: string;
}) {
  return (
    <div
      className={`absolute hidden lg:flex items-center gap-3 px-4 py-3 rounded-2xl glass border border-white/15 shadow-2xl pointer-events-none select-none ${className}`}
    >
      <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
        <Icon className="h-4.5 w-4.5 text-teal-300" />
      </div>
      <div>
        <div className="text-sm font-bold text-white leading-none">{value}</div>
        <div className="text-[10px] text-slate-300 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

export function HeroSection() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const go = (q: string) => {
    router.push(q ? `/listings?search=${encodeURIComponent(q.trim())}` : '/listings');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    go(query);
  };

  return (
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
      {/* ── Animated background orbs ── */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-teal-600/20 rounded-full blur-3xl pointer-events-none animate-drift-slow" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-teal-500/15 rounded-full blur-3xl pointer-events-none animate-drift" />
      <div className="absolute top-1/2 right-1/3 w-60 h-60 bg-amber-500/10 rounded-full blur-3xl pointer-events-none animate-drift-fast" />

      {/* Dot pattern overlay */}
      <div className="absolute inset-0 dot-pattern opacity-40 pointer-events-none" />

      {/* ── Floating glass feature cards (desktop only) ── */}
      <FloatingCard
        icon={ShieldCheck}
        label="All landlords"
        value="KYC Verified"
        className="top-[22%] left-[6%] animate-float-slow"
        />
      <FloatingCard
        icon={Building2}
        label="Across Sri Lanka"
        value="150+ Properties"
        className="top-[18%] right-[5%] animate-float-reverse"
        />
      <FloatingCard
        icon={Clock}
        label="Avg. response"
        value="Under 24h"
        className="bottom-[28%] right-[7%] animate-float-slow [animation-delay:2s]"
      />

      {/* ── Main content with staggered entrance ── */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32 hero-enter">
        {/* 1 · Badge */}
        <div className="flex justify-center mb-6">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold bg-teal-500/25 text-teal-200 border border-teal-400/35 backdrop-blur-sm">
            <ShieldCheck className="h-3.5 w-3.5" />
            Sri Lanka&apos;s #1 Verified Rental Platform
          </span>
        </div>

        {/* 2 · Headline */}
        <div className="text-center mb-8">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-white leading-[1.08] tracking-tight">
            Find Your Perfect
            <span className="block mt-2">
              <span className="gradient-text">Stay in Sri Lanka</span>
            </span>
          </h1>
        </div>

        {/* 3 · Subtitle */}
        <p className="text-center text-lg sm:text-xl text-slate-200 max-w-2xl mx-auto leading-relaxed mb-10">
          Affordable, verified rentals for{' '}
          <span className="text-amber-300 font-semibold">office-goers</span>, couples, students, and families.
          Short- or long-term — <span className="text-teal-300 font-semibold">KYC-verified</span> landlords, no scams.
        </p>

        {/* 4 · Search bar with breathing glow */}
        <form onSubmit={handleSubmit} className="relative z-20 max-w-2xl mx-auto mb-8">
          <div className="glass rounded-2xl p-1.5 animate-search-glow [animation-delay:1.5s]">
            <div className="flex flex-col sm:flex-row gap-1.5">
              <div className="flex-1 flex items-center gap-3 bg-white/15 rounded-xl px-4 py-3">
                <MapPin className="h-5 w-5 text-teal-300 shrink-0" />
                <SearchInputWithSuggestions
                  value={query}
                  onChange={setQuery}
                  onSubmit={(value, item) => {
                    if (item?.kind === 'listing' && 'listingId' in item) {
                      router.push(`/listings/${item.listingId}`);
                    } else {
                      go(value);
                    }
                  }}
                  placeholder="City, area, district…"
                  variant="hero"
                  className="flex-1"
                  inputClassName="flex-1 w-full bg-transparent text-white placeholder-slate-300 text-base outline-none"
                />
              </div>
              <button
                type="submit"
                className="btn-primary-gradient flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-white font-semibold text-base"
              >
                <Search className="h-4 w-4" />
                Search
              </button>
            </div>
          </div>
        </form>

        {/* 5 · Popular searches */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {POPULAR.map((place) => (
            <button
              key={place}
              onClick={() => go(place)}
              className="px-3.5 py-1.5 rounded-full text-xs font-medium text-slate-200 border border-white/25 hover:border-teal-400/60 hover:text-white hover:bg-white/10 transition-all duration-200"
            >
              {place}
            </button>
          ))}
        </div>

        {/* 6 · CTA row */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={() => router.push('/listings')}
            className="btn-primary-gradient flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold text-sm shadow-lg"
          >
            Browse All Listings
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => router.push('/list-your-property')}
            className="btn-saffron-gradient flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold text-sm shadow-lg"
          >
            <Zap className="h-4 w-4" />
            List Your Property
          </button>
          <button
            onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
            className="px-6 py-3 rounded-xl text-slate-100 font-semibold text-sm border border-white/30 hover:border-white/50 hover:text-white hover:bg-white/10 transition-all duration-200"
          >
            How It Works
          </button>
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
  );
}
