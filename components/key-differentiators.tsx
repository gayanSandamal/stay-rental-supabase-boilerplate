import { Zap, Droplet, Wifi, ShieldCheck, MapPin, Clock } from 'lucide-react';
import { ScrollReveal } from './scroll-reveal';

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'KYC Verified Listings',
    description:
      'Every landlord provides ownership documents and a government-issued ID. Our ops team cross-checks before publishing.',
    tag: 'Zero Scams',
    gradient: 'from-emerald-600 to-teal-700',
    tagColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    icon: Zap,
    title: 'Power Resilience Filters',
    description:
      'Filter by generator, solar, UPS, or utility only. Find properties that match your power needs — crucial for Sri Lanka.',
    tag: 'Sri Lanka Specific',
    gradient: 'from-amber-500 to-amber-700',
    tagColor: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    icon: Droplet,
    title: 'Water Source Info',
    description:
      'Know the water source before you commit — mains, tank, borehole. Essential transparency for long-term stays.',
    tag: 'Full Transparency',
    gradient: 'from-sky-500 to-teal-600',
    tagColor: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  {
    icon: Wifi,
    title: 'Fiber Internet Ready',
    description:
      'Filter by fiber availability and ISP options per property. Stay connected seamlessly — perfect for remote workers.',
    tag: 'Work From Home',
    gradient: 'from-teal-600 to-teal-800',
    tagColor: 'bg-teal-50 text-teal-800 border-teal-200',
  },
  {
    icon: MapPin,
    title: 'Hyper-Local Focus',
    description:
      'Built from the ground up for the Sri Lankan rental market. Every filter, every field, every feature designed locally.',
    tag: 'Built for SL',
    gradient: 'from-amber-600 to-amber-800',
    tagColor: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  {
    icon: Clock,
    title: 'Fast Viewing Coordination',
    description:
      'Request a viewing in 30 seconds. Our team contacts the landlord and sends you a confirmation via WhatsApp or email.',
    tag: '24h Response',
    gradient: 'from-teal-700 to-teal-900',
    tagColor: 'bg-teal-50 text-teal-800 border-teal-200',
  },
];

export function KeyDifferentiators() {
  return (
    <section className="py-20 bg-[#F7F4ED] relative overflow-hidden">
      <div className="absolute inset-0 dot-pattern opacity-30 pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="text-center mb-14">
            <span className="inline-block px-3 py-1 text-xs font-semibold tracking-widest text-teal-800 bg-teal-50 border border-teal-200 rounded-full uppercase mb-4">
              Why Stay Rental
            </span>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight">
              We Solve What Others{' '}
              <span className="relative inline-block">
                <span className="gradient-text">Ignore</span>
              </span>
            </h2>
            <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
              Renting in Sri Lanka has unique challenges. We built every feature to tackle them head-on.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal stagger className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={i}
                className="group bg-white rounded-2xl p-7 border border-slate-200/80 card-hover card-glow shadow-sm"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.gradient} flex items-center justify-center mb-5 shadow-md group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>

                <span className={`inline-block px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-full border mb-3 ${f.tagColor}`}>
                  {f.tag}
                </span>

                <h3 className="text-lg font-bold text-slate-900 mb-2">{f.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">{f.description}</p>
              </div>
            );
          })}
        </ScrollReveal>
      </div>
    </section>
  );
}
