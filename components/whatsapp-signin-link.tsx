import { MessageCircle } from 'lucide-react';
import { formatWhatsAppDisplay, getSignInWhatsAppLink } from '@/lib/site-config';

/**
 * Sign-in route for landlords who arrived through the WhatsApp concierge.
 *
 * Those accounts are passwordless by construction — the intake pipeline creates
 * them with no password and a placeholder address they are never shown — so the
 * email/password form above cannot work for them, "forgot password" mails an
 * unmonitored domain, and signing up afresh would strand their listings on the
 * original account.
 *
 * It has to be the landlord who presses send. Meta only allows a free-form
 * message inside the 24-hour window opened by the customer's own last message,
 * so pushing a link out to a landlord who has been quiet for weeks — exactly
 * the person who needs this — is rejected outright. Their tap opens that
 * window; the bot's existing LINK command sends the links straight back.
 *
 * Renders nothing when the number is unconfigured, matching every other
 * concierge CTA: better absent than pointing at a placeholder.
 */
export function WhatsAppSignInLink({ className = '' }: { className?: string }) {
  const href = getSignInWhatsAppLink();
  if (!href) return null;
  const display = formatWhatsAppDisplay();

  return (
    <div className={className}>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-gray-50 text-gray-500">Listed via WhatsApp?</span>
        </div>
      </div>

      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 w-full flex justify-center items-center gap-2 py-2 px-4 border border-green-600 rounded-full shadow-sm text-sm font-medium text-green-700 bg-white hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-600"
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        Send us &ldquo;LINK&rdquo; on WhatsApp
      </a>
      <p className="mt-2 text-center text-xs text-gray-500">
        We&rsquo;ll reply with your sign-in link
        {display ? ` — ${display}` : ''}.
      </p>
    </div>
  );
}
