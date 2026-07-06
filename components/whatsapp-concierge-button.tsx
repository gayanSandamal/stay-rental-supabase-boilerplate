import { MessageCircle } from 'lucide-react';
import { getConciergeWhatsAppLink } from '@/lib/site-config';

/**
 * "WhatsApp us your photos — we list it for you" deep-link button.
 * Renders nothing when NEXT_PUBLIC_WHATSAPP_SUPPORT is unconfigured.
 * Flag gating (enableWhatsAppConcierge) is the CALLER's responsibility,
 * matching the convention that sections check their own flags.
 */
const VARIANTS = {
  // On dark hero/CTA backgrounds
  dark: 'inline-flex items-center gap-2 px-6 py-3 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold shadow-md transition-colors',
  // On light/beige sections
  light:
    'inline-flex items-center gap-2 px-6 py-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-md transition-colors',
  // Inline/compact placements (empty states, banners)
  compact:
    'inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors',
} as const;

export function WhatsAppConciergeButton({
  source,
  label = 'WhatsApp us — we list it for you',
  variant = 'light',
  className = '',
}: {
  /** Short attribution suffix appended to the prefilled message. */
  source?: string;
  label?: string;
  variant?: keyof typeof VARIANTS;
  className?: string;
}) {
  const href = getConciergeWhatsAppLink(source);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${VARIANTS[variant]} ${className}`}
    >
      <MessageCircle className={variant === 'compact' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      {label}
    </a>
  );
}
