import { Search, Calendar, CheckCircle2, Home } from 'lucide-react';

const STEPS = [
  {
    icon: Search,
    title: 'Browse Verified Listings',
    description:
      'Use our Sri Lanka-specific filters — power backup, water source, fiber internet — to instantly narrow down properties you\'ll love.',
    step: '01',
    color: 'from-teal-700 to-teal-900',
    numColor: 'text-teal-200',
  },
  {
    icon: Calendar,
    title: 'Request a Viewing',
    description:
      'Pick your preferred date and time with a single form. No back-and-forth calls needed — we handle all coordination.',
    step: '02',
    color: 'from-amber-500 to-amber-700',
    numColor: 'text-amber-200',
  },
  {
    icon: CheckCircle2,
    title: 'Confirm & Visit',
    description:
      'Get a WhatsApp or email confirmation within 24 hours. Walk through the property stress-free with full listing details in hand.',
    step: '03',
    color: 'from-emerald-600 to-teal-700',
    numColor: 'text-emerald-200',
  },
  {
    icon: Home,
    title: 'Move Into Your Home',
    description:
      'Finalise the rental agreement and move in. We\'re here every step of the way from first search to first night.',
    step: '04',
    color: 'from-teal-500 to-teal-700',
    numColor: 'text-teal-200',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16">
          <span className="inline-block px-3 py-1 text-xs font-semibold tracking-widest text-teal-800 bg-teal-50 border border-teal-200 rounded-full uppercase mb-4">
            Simple Process
          </span>
          <h2 className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight">
            From Search to{' '}
            <span className="gradient-text">Move-In</span>
          </h2>
          <p className="mt-4 text-lg text-slate-600 max-w-xl mx-auto">
            Four straightforward steps — no middlemen, no hidden fees, no surprises.
          </p>
        </div>

        {/* Steps */}
        <div className="relative grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Connector line (desktop) */}
          <div className="hidden lg:block absolute top-10 left-[calc(12.5%+1rem)] right-[calc(12.5%+1rem)] h-0.5 step-connector z-0" />

          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="relative z-10 flex flex-col items-center text-center group">
                {/* Step badge */}
                <div className="relative mb-5">
                  {/* Outer ring glow */}
                  <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${s.color} opacity-20 blur-md scale-125 group-hover:opacity-40 transition-opacity duration-300`} />
                  {/* Icon circle */}
                  <div className={`relative w-20 h-20 rounded-full bg-gradient-to-br ${s.color} flex items-center justify-center shadow-xl group-hover:scale-105 transition-transform duration-300`}>
                    <Icon className="h-9 w-9 text-white" />
                  </div>
                  {/* Step number */}
                  <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center shadow-sm">
                    <span className="text-[10px] font-extrabold text-slate-600">{i + 1}</span>
                  </div>
                </div>

                <div className={`text-6xl font-black ${s.numColor} -mb-2 select-none leading-none`}>
                  {s.step}
                </div>

                <h3 className="text-base font-bold text-slate-900 mb-2 mt-1">{s.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{s.description}</p>
              </div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="mt-14 text-center">
          <a
            href="/listings"
            className="btn-primary-gradient inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-white font-semibold text-base shadow-xl shadow-teal-800/25"
          >
            Start Browsing Now
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
