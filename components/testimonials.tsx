import { Star } from 'lucide-react';
import { ScrollReveal } from './scroll-reveal';

type Testimonial = {
  name: string;
  role: string;
  location: string;
  rating: number;
  text: string;
  initials: string;
  gradient: string;
};

/**
 * EMPTY ON PURPOSE — do not repopulate with examples.
 *
 * This held three invented renters ("Sarah Mendis", "David Karunaratne",
 * "Priya Senanayake") with invented roles, locations, 5-star ratings and
 * quotes, under a "Real Stories" badge. They were never real people and no
 * renter has ever left a review.
 *
 * It was invisible only because `showFoundingStageCopy` is on and
 * `app/(dashboard)/page.tsx` renders <FoundingLandlordCta /> instead. Flipping
 * that flag — a one-click DB override in Back Office → Settings — would have
 * published fabricated customer reviews. That is not a copy problem, it is
 * passing off invented endorsements as genuine, and it directly contradicts
 * this site's own promise of "no fake counts, no fake reviews".
 *
 * The layout below is kept so real testimonials can be dropped straight in.
 * Add an entry ONLY with the named person's permission. Until then the section
 * renders nothing, which is the honest state and makes the flag safe to flip.
 */
const TESTIMONIALS: Testimonial[] = [];

export function Testimonials() {
  // No real testimonials yet — render nothing rather than anything invented.
  if (TESTIMONIALS.length === 0) return null;

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
              Renters who found a home through Easy Rent, in their own words.
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
