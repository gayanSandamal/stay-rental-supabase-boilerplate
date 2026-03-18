import { Star } from 'lucide-react';
import { ScrollReveal } from './scroll-reveal';

const TESTIMONIALS = [
  {
    name: 'Sarah Mendis',
    role: 'Software Developer',
    location: 'Colombo 05',
    rating: 5,
    text: 'Found my perfect apartment in just 2 weeks. The verification process gave me real confidence, and I contacted the landlord directly — moved in within a month.',
    initials: 'SM',
    gradient: 'from-teal-600 to-teal-800',
  },
  {
    name: 'David Karunaratne',
    role: 'Expat Professional',
    location: 'Kandy',
    rating: 5,
    text: 'The power backup and fiber internet filters are genuinely game-changing. I found a place with solar and SLT fiber in one search — could not have done it anywhere else.',
    initials: 'DK',
    gradient: 'from-emerald-600 to-teal-700',
  },
  {
    name: 'Priya Senanayake',
    role: 'Postgraduate Student',
    location: 'Nugegoda',
    rating: 5,
    text: 'As a student on a budget I was worried about scams. Every listing here is verified and affordable — I rented with full confidence. Direct contact made it so easy.',
    initials: 'PS',
    gradient: 'from-amber-500 to-amber-700',
  },
];

export function Testimonials() {
  return (
    <section className="py-20 bg-[#F7F4ED] relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px divider-gradient" />
      <div className="absolute inset-0 dot-pattern opacity-20 pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="text-center mb-14">
            <span className="inline-block px-3 py-1 text-xs font-semibold tracking-widest text-amber-700 bg-amber-50 border border-amber-200 rounded-full uppercase mb-4">
              Real Stories
            </span>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight">
              Renters Who Found Their{' '}
              <span className="gradient-text">Perfect Home</span>
            </h2>
            <p className="mt-4 text-lg text-slate-600 max-w-xl mx-auto">
              Thousands of Sri Lankan renters have moved in stress-free. Here are a few of their stories.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal stagger className="grid md:grid-cols-3 gap-7">
          {TESTIMONIALS.map((t, i) => (
            <div
              key={i}
              className="relative bg-white rounded-2xl p-7 border border-slate-200/80 shadow-sm card-hover card-glow flex flex-col"
            >
              <div className="absolute top-5 right-6 text-7xl font-serif text-slate-100 select-none leading-none pointer-events-none">
                &ldquo;
              </div>

              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: t.rating }).map((_, j) => (
                  <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />
                ))}
              </div>

              <p className="text-slate-700 text-sm leading-relaxed mb-6 flex-1 relative z-10">
                {t.text}
              </p>

              <div className="divider-gradient mb-5" />

              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.gradient} flex items-center justify-center text-white text-xs font-bold shadow-md`}>
                  {t.initials}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">{t.name}</div>
                  <div className="text-xs text-slate-600">
                    {t.role} · {t.location}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </ScrollReveal>

        <ScrollReveal>
          <div className="mt-14 flex flex-wrap justify-center items-center gap-8 py-8 px-8 rounded-2xl bg-white border border-slate-200 shadow-sm">
            {[
              ['4.9 / 5', 'Average Rating'],
              ['500+', 'Happy Renters'],
              ['24h', 'Avg. Response Time'],
              ['0', 'Scam Reports'],
            ].map(([val, lbl]) => (
              <div key={lbl} className="text-center">
                <div className="text-2xl font-extrabold text-slate-900">{val}</div>
                <div className="text-xs text-slate-600 mt-0.5">{lbl}</div>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
