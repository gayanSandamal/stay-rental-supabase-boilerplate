'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Search, Phone, MessageCircle, Home, ArrowRight, Wifi, Zap, ShieldCheck } from 'lucide-react';

/* ─── Step data ─────────────────────────────────────────────────────────── */

const STEPS = [
  {
    icon: Search,
    num: '01',
    title: 'Browse Verified Listings',
    description:
      'Filter by power backup (for outages), water source, and fiber internet (for remote work) — Sri Lanka-specific features that matter when choosing a home.',
    gradient: 'from-teal-700 to-teal-900',
    ringColor: 'ring-teal-400/40',
    accentBg: 'bg-teal-500',
  },
  {
    icon: Phone,
    num: '02',
    title: 'Contact the Owner',
    description:
      'Sign in to see verified contact numbers. Call directly or message via WhatsApp — no middlemen.',
    gradient: 'from-amber-500 to-amber-700',
    ringColor: 'ring-amber-400/40',
    accentBg: 'bg-amber-500',
  },
  {
    icon: Home,
    num: '03',
    title: 'Move Into Your Home',
    description:
      'Finalise the rental agreement and move in. We\'re here every step of the way — from first search to first night.',
    gradient: 'from-teal-500 to-teal-700',
    ringColor: 'ring-teal-400/40',
    accentBg: 'bg-teal-500',
  },
];

/* ─── Scene components ──────────────────────────────────────────────────── */

function SceneBrowse({ active }: { active: boolean }) {
  const base = 'transition-all duration-500 ease-out';
  const hidden = 'opacity-0 translate-y-4';
  const show = 'opacity-100 translate-y-0';

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center gap-3 p-4">
      {/* Mini search bar */}
      <div className={`${base} ${active ? show : hidden} w-full max-w-[220px] flex items-center gap-2 bg-white rounded-xl px-3 py-2.5 shadow-lg border border-slate-200`}>
        <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <div className="flex-1 overflow-hidden">
          <span className={`text-xs text-slate-700 font-medium ${active ? 'hiw-typing' : ''}`}>
            Colombo 3, apartment…
          </span>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap justify-center gap-1.5 max-w-[240px]">
        {[
          { icon: ShieldCheck, label: 'Verified', delay: '0.3s' },
          { icon: Zap, label: 'Solar', delay: '0.45s' },
          { icon: Wifi, label: 'Fiber', delay: '0.6s' },
        ].map((chip) => (
          <span
            key={chip.label}
            className={`${base} ${active ? show : hidden} inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-teal-50 text-teal-800 border border-teal-200 shadow-sm`}
            style={{ transitionDelay: active ? chip.delay : '0s' }}
          >
            <chip.icon className="h-2.5 w-2.5" />
            {chip.label}
          </span>
        ))}
      </div>

      {/* Mini property cards */}
      <div className="flex gap-2 mt-1">
        {[0, 1].map((i) => (
          <div
            key={i}
            className={`${base} ${active ? show : hidden} w-[100px] bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden`}
            style={{ transitionDelay: active ? `${0.7 + i * 0.15}s` : '0s' }}
          >
            <div className="h-12 bg-gradient-to-br from-teal-100 to-teal-50" />
            <div className="p-2 space-y-1">
              <div className="h-1.5 bg-slate-200 rounded-full w-3/4" />
              <div className="h-1.5 bg-slate-100 rounded-full w-1/2" />
              <div className="text-[8px] font-bold text-teal-700">LKR 45,000</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SceneContact({ active }: { active: boolean }) {
  const base = 'transition-all duration-500 ease-out';
  const hidden = 'opacity-0 translate-y-4';
  const show = 'opacity-100 translate-y-0';

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center gap-3 p-4">
      {/* Contact card */}
      <div
        className={`${base} ${active ? show : hidden} bg-white rounded-2xl shadow-lg border border-slate-200 p-3.5 w-full max-w-[220px]`}
      >
        {/* Owner header */}
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-600 to-teal-800 flex items-center justify-center">
            <span className="text-[8px] font-bold text-white">AJ</span>
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-800">Amal Jayasinghe</div>
            <div className="flex items-center gap-1">
              <ShieldCheck className="h-2 w-2 text-emerald-500" />
              <span className="text-[7px] font-medium text-emerald-600">Verified Owner</span>
            </div>
          </div>
        </div>

        {/* Phone number reveal */}
        <div
          className={`${base} ${active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'} flex items-center gap-2 px-2.5 py-2 bg-slate-50 rounded-lg border border-slate-200 mb-2.5`}
          style={{ transitionDelay: active ? '0.35s' : '0s' }}
        >
          <Phone className="h-3 w-3 text-teal-700 shrink-0" />
          <span className="text-[10px] font-semibold text-slate-800">+94 77 123 4567</span>
          <span className="ml-auto px-1.5 py-0.5 text-[7px] font-bold bg-emerald-100 text-emerald-700 rounded">
            Verified
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex gap-1.5">
          <div
            className={`${base} ${active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'} flex-1 flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg text-[9px] font-bold text-white bg-teal-700 shadow-sm`}
            style={{ transitionDelay: active ? '0.55s' : '0s' }}
          >
            <Phone className="h-2.5 w-2.5" />
            Call
          </div>
          <div
            className={`${base} ${active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'} flex-1 flex items-center justify-center gap-1 px-2.5 py-2 rounded-lg text-[9px] font-bold text-white bg-emerald-600 shadow-sm`}
            style={{ transitionDelay: active ? '0.7s' : '0s' }}
          >
            <MessageCircle className="h-2.5 w-2.5" />
            WhatsApp
          </div>
        </div>
      </div>

      {/* "Direct contact" badge */}
      <div
        className={`${base} ${active ? 'opacity-100 scale-100' : 'opacity-0 scale-90'} flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200`}
        style={{ transitionDelay: active ? '0.9s' : '0s' }}
      >
        <span className="text-[10px] font-bold text-amber-700">No middlemen — talk directly</span>
      </div>
    </div>
  );
}

function SceneMoveIn({ active }: { active: boolean }) {
  const base = 'transition-all duration-700 ease-out';

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center gap-4 p-4">
      {/* House SVG */}
      <svg
        viewBox="0 0 160 140"
        className="w-[160px] h-[140px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* House body */}
        <rect
          x="30" y="60" width="100" height="70" rx="4"
          className={`text-teal-700 ${active ? 'hiw-draw' : ''}`}
          style={{ strokeDasharray: 340, strokeDashoffset: active ? 0 : 340 }}
        />
        {/* Roof */}
        <path
          d="M20 65 L80 20 L140 65"
          className={`text-teal-800 ${active ? 'hiw-draw' : ''}`}
          style={{ strokeDasharray: 200, strokeDashoffset: active ? 0 : 200, transitionDelay: '0.2s' }}
        />
        {/* Door */}
        <rect
          x="62" y="88" width="36" height="42" rx="3"
          className={`text-amber-600 ${active ? 'hiw-draw' : ''}`}
          style={{ strokeDasharray: 160, strokeDashoffset: active ? 0 : 160, transitionDelay: '0.5s' }}
        />
        {/* Door knob */}
        <circle
          cx="90" cy="110" r="2.5"
          className={`${base} ${active ? 'text-amber-500 fill-amber-500 opacity-100' : 'opacity-0'}`}
          style={{ transitionDelay: '0.9s' }}
        />
        {/* Left window */}
        <rect
          x="40" y="72" width="16" height="14" rx="2"
          className={`text-teal-500 ${active ? 'hiw-draw' : ''}`}
          style={{ strokeDasharray: 60, strokeDashoffset: active ? 0 : 60, transitionDelay: '0.6s' }}
        />
        {/* Right window */}
        <rect
          x="104" y="72" width="16" height="14" rx="2"
          className={`text-teal-500 ${active ? 'hiw-draw' : ''}`}
          style={{ strokeDasharray: 60, strokeDashoffset: active ? 0 : 60, transitionDelay: '0.7s' }}
        />
      </svg>

      {/* Welcome text + key */}
      <div className="flex items-center gap-3">
        <div
          className={`${base} ${active ? 'opacity-100 rotate-0' : 'opacity-0 -rotate-45'}`}
          style={{ transitionDelay: '1s' }}
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7.5" cy="7.5" r="5.5" />
            <path d="M11.5 11.5L22 22" />
            <path d="M18 18l-2 2" />
            <path d="M15 21l-2 2" />
          </svg>
        </div>
        <span
          className={`${base} text-sm font-bold text-slate-800 ${active ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}
          style={{ transitionDelay: '1.15s' }}
        >
          Welcome Home!
        </span>
      </div>
    </div>
  );
}

const SCENES = [SceneBrowse, SceneContact, SceneMoveIn];

/* ─── Timeline step wrapper ─────────────────────────────────────────────── */

function TimelineStep({
  step,
  index,
  active,
  scene,
}: {
  step: (typeof STEPS)[number];
  index: number;
  active: boolean;
  scene: ReactNode;
}) {
  const Icon = step.icon;
  const isEven = index % 2 === 0;

  return (
    <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-6 lg:gap-10 items-center">
      {/* Content — left on even, right on odd (desktop) */}
      <div className={`${isEven ? 'lg:order-1' : 'lg:order-3'} ${isEven ? 'lg:text-right' : 'lg:text-left'}`}>
        <div
          className={`transition-all duration-700 ease-out ${
            active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
          style={{ transitionDelay: active ? '0.1s' : '0s' }}
        >
          <span className="text-5xl sm:text-6xl font-black text-slate-500 select-none leading-none">
            {step.num}
          </span>
          <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 mb-2">{step.title}</h3>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-sm inline-block">
            {step.description}
          </p>
        </div>
      </div>

      {/* Center node */}
      <div className="hidden lg:flex order-2 flex-col items-center">
        <div
          className={`relative w-16 h-16 rounded-full bg-gradient-to-br ${step.gradient} flex items-center justify-center shadow-xl transition-all duration-500 ${
            active ? `scale-110 ring-4 ${step.ringColor}` : 'scale-100 ring-0 ring-transparent'
          }`}
        >
          <Icon className="h-7 w-7 text-white" />
          <div
            className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center shadow transition-transform duration-300 ${
              active ? 'scale-100' : 'scale-0'
            }`}
          >
            <span className="text-[8px] font-extrabold text-slate-600">{index + 1}</span>
          </div>
        </div>
      </div>

      {/* Scene — right on even, left on odd (desktop) */}
      <div className={`${isEven ? 'lg:order-3' : 'lg:order-1'}`}>
        <div
          className={`relative bg-gradient-to-br from-slate-50 to-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden min-h-[260px] transition-all duration-500 ${
            active ? 'shadow-lg border-slate-200' : ''
          }`}
        >
          {/* Mobile step indicator */}
          <div className={`lg:hidden flex items-center gap-3 p-3 pb-0`}>
            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${step.gradient} flex items-center justify-center shadow-md`}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            <span className="text-xs font-bold text-slate-500">Step {index + 1}</span>
          </div>
          {scene}
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ────────────────────────────────────────────────────── */

export function HowItWorks() {
  const [activeSteps, setActiveSteps] = useState<Set<number>>(new Set());
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [headerVisible, setHeaderVisible] = useState(false);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setActiveSteps(new Set([0, 1, 2]));
      setHeaderVisible(true);
      return;
    }

    const headerObs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setHeaderVisible(true); },
      { threshold: 0.3 }
    );
    if (sectionRef.current) headerObs.observe(sectionRef.current);

    const observers = stepRefs.current.map((el, i) => {
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveSteps((prev) => new Set([...prev, i]));
          }
        },
        { threshold: 0.25, rootMargin: '0px 0px -60px 0px' }
      );
      obs.observe(el);
      return obs;
    });

    return () => {
      headerObs.disconnect();
      observers.forEach((obs) => obs?.disconnect());
    };
  }, []);

  const highestActive = Math.max(-1, ...activeSteps);
  const progressPercent = activeSteps.size === 0 ? 0 : ((highestActive + 1) / STEPS.length) * 100;

  return (
    <section id="how-it-works" className="py-20 lg:py-28 bg-white overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div
          ref={sectionRef}
          className={`text-center mb-16 lg:mb-20 transition-all duration-700 ease-out ${
            headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <span className="inline-block px-3 py-1 text-xs font-semibold tracking-widest text-teal-800 bg-teal-50 border border-teal-200 rounded-full uppercase mb-4">
            Simple Process
          </span>
          <h2 className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight">
            From Search to{' '}
            <span className="gradient-text">Move-In</span>
          </h2>
          <p className="mt-4 text-lg text-slate-600 max-w-xl mx-auto">
            Three straightforward steps — no middlemen, no hidden fees, no surprises.
          </p>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical progress line (desktop) */}
          <div className="hidden lg:block absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-0.5">
            {/* Track */}
            <div className="absolute inset-0 bg-slate-100 rounded-full" />
            {/* Progress fill */}
            <div
              className="absolute top-0 left-0 right-0 bg-gradient-to-b from-teal-600 to-teal-400 rounded-full transition-all duration-1000 ease-out"
              style={{ height: `${progressPercent}%` }}
            />
          </div>

          {/* Steps */}
          <div className="space-y-16 lg:space-y-24">
            {STEPS.map((step, i) => {
              const Scene = SCENES[i];
              const active = activeSteps.has(i);

              return (
                <div
                  key={i}
                  ref={(el) => { stepRefs.current[i] = el; }}
                >
                  <TimelineStep
                    step={step}
                    index={i}
                    active={active}
                    scene={<Scene active={active} />}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <div
          className={`mt-16 lg:mt-20 text-center transition-all duration-700 ease-out ${
            activeSteps.has(2) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
          style={{ transitionDelay: activeSteps.has(2) ? '0.5s' : '0s' }}
        >
          <a
            href="/listings"
            className="btn-primary-gradient inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-white font-semibold text-base shadow-xl shadow-teal-800/25"
          >
            Start Browsing Now
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
