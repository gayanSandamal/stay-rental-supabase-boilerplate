import { ShieldCheck, MessageCircle } from 'lucide-react';

/*
 * The ONE place the verification wording lives.
 *
 * Three different things on this site can be "verified" and they are not
 * interchangeable, so none of them is allowed to render the bare word:
 *
 *   VERIFIED_LISTING_LABEL  — listings.verified, the PROPERTY was checked.
 *   VERIFIED_LANDLORD_LABEL — landlords.kycVerified, the PERSON was checked.
 *   WHATSAPP_VERIFIED_LABEL — users.waPhoneVerifiedAt, Meta proved possession
 *                             of the contact number. Automatic and by far the
 *                             most common; it is NOT an identity check.
 *
 * A renter deciding whether to hand over a deposit has to be able to tell which
 * claim is being made, and the three were previously indistinguishable badges
 * reading "Verified". Note also why there is no "all landlords verified" claim
 * anywhere: see the comments in trust-signals.tsx and key-differentiators.tsx —
 * the app has no ID or deed upload path, so kycVerified is only ever set by an
 * operator recording a check they did offline.
 */
export const VERIFIED_LISTING_LABEL = 'Verified listing';
export const VERIFIED_LANDLORD_LABEL = 'Verified landlord';
export const WHATSAPP_VERIFIED_LABEL = 'WhatsApp verified';

export const VERIFIED_LANDLORD_TITLE =
  'This landlord’s identity and ownership documents were checked by Easy Rent.';
export const WHATSAPP_VERIFIED_TITLE =
  'This landlord’s contact number was verified over WhatsApp. It is not an identity check.';

interface VerificationBadgesProps {
  kycVerified?: boolean | null;
  whatsappVerified?: boolean | null;
  /** `overlay` = solid pill over the card image; `inline` = chip beside a name. */
  variant?: 'overlay' | 'inline';
}

export function VerificationBadges({
  kycVerified,
  whatsappVerified,
  variant = 'inline',
}: VerificationBadgesProps) {
  if (!kycVerified && !whatsappVerified) return null;

  const icon = variant === 'overlay' ? 'h-2.5 w-2.5' : 'h-3 w-3';
  const base =
    variant === 'overlay'
      ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shadow'
      : 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border';

  return (
    <>
      {kycVerified && (
        <span
          title={VERIFIED_LANDLORD_TITLE}
          className={`${base} ${
            variant === 'overlay'
              ? 'bg-emerald-700 text-white'
              : 'bg-emerald-100 text-emerald-800 border-emerald-200'
          }`}
        >
          <ShieldCheck className={icon} /> {VERIFIED_LANDLORD_LABEL}
        </span>
      )}
      {whatsappVerified && (
        <span
          title={WHATSAPP_VERIFIED_TITLE}
          className={`${base} ${
            variant === 'overlay'
              ? 'bg-green-600 text-white'
              : 'bg-green-50 text-green-700 border-green-200'
          }`}
        >
          <MessageCircle className={icon} /> {WHATSAPP_VERIFIED_LABEL}
        </span>
      )}
    </>
  );
}
