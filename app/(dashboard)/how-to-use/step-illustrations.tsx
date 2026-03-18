/**
 * Animated SVG illustrations for each How-to-Use step.
 * Pure CSS + SVG-native animations — no JS runtime needed (server component safe).
 */

/* ═══════════════════════════════════════════════════
   Renter illustrations (teal palette)
   ═══════════════════════════════════════════════════ */

/** Step 1 — Find a rental: magnifier scanning over houses on a map */
export function SearchHousesIllustration() {
  return (
    <svg viewBox="0 0 80 72" fill="none" aria-hidden="true" className="w-full h-full">
      {/* Ground strip */}
      <rect x="4" y="52" width="72" height="16" rx="4" fill="#E6F5F4" stroke="#B2DFDB" strokeWidth=".8" />

      {/* House 1 — small left */}
      <rect x="10" y="38" width="16" height="16" rx="2" fill="#B2DFDB" />
      <path d="M8 40 L18 30 L28 40" fill="#80CBC4" stroke="#0F5C5A" strokeWidth=".8" strokeLinejoin="round" />
      <rect x="15" y="44" width="6" height="10" rx="1" fill="#0F5C5A" opacity=".25" />

      {/* House 2 — taller centre */}
      <rect x="30" y="32" width="18" height="22" rx="2" fill="#B2DFDB" />
      <path d="M28 34 L39 22 L50 34" fill="#80CBC4" stroke="#0F5C5A" strokeWidth=".8" strokeLinejoin="round" />
      <rect x="33" y="36" width="5" height="5" rx="1" fill="#0F5C5A" opacity=".2" />
      <rect x="41" y="36" width="5" height="5" rx="1" fill="#0F5C5A" opacity=".2" />
      <rect x="36" y="44" width="6" height="10" rx="1" fill="#0F5C5A" opacity=".25" />

      {/* House 3 — right */}
      <rect x="54" y="40" width="14" height="14" rx="2" fill="#B2DFDB" />
      <path d="M52 42 L61 33 L70 42" fill="#80CBC4" stroke="#0F5C5A" strokeWidth=".8" strokeLinejoin="round" />
      <rect x="58" y="45" width="5" height="9" rx="1" fill="#0F5C5A" opacity=".25" />

      {/* Animated magnifier — scans left-to-right-to-left */}
      <g>
        <animateTransform
          attributeName="transform" type="translate"
          values="0,0; 22,-4; 44,0; 22,-4; 0,0"
          dur="5s" repeatCount="indefinite"
        />
        <circle cx="16" cy="22" r="9" fill="#E0F7FA" fillOpacity=".5" stroke="#0F5C5A" strokeWidth="1.5" />
        <line x1="23" y1="28" x2="28" y2="33" stroke="#0F5C5A" strokeWidth="2" strokeLinecap="round" />
        {/* Glow ring */}
        <circle cx="16" cy="22" r="12" fill="none" stroke="#0F5C5A" strokeWidth=".6" opacity=".35">
          <animate attributeName="r" values="12;15;12" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values=".35;0;.35" dur="2s" repeatCount="indefinite" />
        </circle>
      </g>
    </svg>
  );
}

/** Step 2 — View listing details: card with photo + text lines appearing */
export function ViewDetailsIllustration() {
  return (
    <svg viewBox="0 0 80 72" fill="none" aria-hidden="true" className="w-full h-full">
      {/* Card */}
      <rect x="12" y="6" width="56" height="60" rx="6" fill="white" stroke="#B2DFDB" strokeWidth="1" />

      {/* Photo area */}
      <rect x="17" y="11" width="46" height="22" rx="3" fill="#E0F7FA">
        <animate attributeName="opacity" values="0;1" dur="0.4s" fill="freeze" />
      </rect>
      {/* Mountain / image icon inside photo */}
      <path d="M24 28 L32 20 L38 26 L42 22 L52 30" stroke="#0F5C5A" strokeWidth="1" strokeLinejoin="round" fill="none" opacity=".4">
        <animate attributeName="opacity" values="0;.4" dur="0.5s" begin="0.3s" fill="freeze" />
      </path>
      <circle cx="47" cy="18" r="3" fill="#80CBC4" opacity=".5">
        <animate attributeName="opacity" values="0;.5" dur="0.3s" begin="0.4s" fill="freeze" />
      </circle>

      {/* Text lines — staggered fade-in */}
      <rect x="17" y="37" width="36" height="3" rx="1.5" fill="#B2DFDB">
        <animate attributeName="width" values="0;36" dur="0.3s" begin="0.5s" fill="freeze" />
      </rect>
      <rect x="17" y="43" width="28" height="3" rx="1.5" fill="#E0F2F1">
        <animate attributeName="width" values="0;28" dur="0.3s" begin="0.7s" fill="freeze" />
      </rect>
      <rect x="17" y="49" width="32" height="3" rx="1.5" fill="#E0F2F1">
        <animate attributeName="width" values="0;32" dur="0.3s" begin="0.9s" fill="freeze" />
      </rect>

      {/* Price badge */}
      <rect x="17" y="56" width="20" height="6" rx="3" fill="#0F5C5A" opacity="0">
        <animate attributeName="opacity" values="0;1" dur="0.3s" begin="1.1s" fill="freeze" />
      </rect>
      <text x="27" y="61" textAnchor="middle" fill="white" fontSize="4" fontWeight="700" fontFamily="system-ui,sans-serif" opacity="0">
        LKR 35K
        <animate attributeName="opacity" values="0;1" dur="0.3s" begin="1.1s" fill="freeze" />
      </text>

      {/* Eye icon — top-right corner */}
      <g opacity="0">
        <animate attributeName="opacity" values="0;1" dur="0.4s" begin="1.3s" fill="freeze" />
        <circle cx="60" cy="51" r="7" fill="#E0F7FA" stroke="#0F5C5A" strokeWidth=".8" />
        <circle cx="60" cy="51" r="3" fill="none" stroke="#0F5C5A" strokeWidth=".8" />
        <circle cx="60" cy="51" r="1.2" fill="#0F5C5A" />
      </g>
    </svg>
  );
}

/** Step 3 — Contact landlord: phone with WhatsApp chat bubble */
export function ContactLandlordIllustration() {
  return (
    <svg viewBox="0 0 80 72" fill="none" aria-hidden="true" className="w-full h-full">
      {/* Phone body */}
      <rect x="22" y="8" width="28" height="52" rx="5" fill="white" stroke="#0F5C5A" strokeWidth="1.2" />
      {/* Screen */}
      <rect x="25" y="14" width="22" height="38" rx="2" fill="#E0F7FA" />
      {/* Speaker */}
      <rect x="32" y="10" width="8" height="2" rx="1" fill="#B2DFDB" />
      {/* Home button */}
      <circle cx="36" cy="56" r="2.5" fill="none" stroke="#B2DFDB" strokeWidth=".8" />

      {/* Contact lines on screen */}
      <circle cx="32" cy="22" r="4" fill="#B2DFDB" />
      <rect x="38" y="20" width="7" height="2" rx="1" fill="#80CBC4" />
      <rect x="38" y="24" width="5" height="1.5" rx=".75" fill="#B2DFDB" />

      {/* Ring waves — pulsing arcs */}
      <path d="M52 18 Q58 12 58 6" fill="none" stroke="#0F5C5A" strokeWidth="1" strokeLinecap="round" opacity="0">
        <animate attributeName="opacity" values="0;.6;0" dur="1.8s" repeatCount="indefinite" />
      </path>
      <path d="M54 22 Q62 14 62 4" fill="none" stroke="#0F5C5A" strokeWidth=".8" strokeLinecap="round" opacity="0">
        <animate attributeName="opacity" values="0;.4;0" dur="1.8s" repeatCount="indefinite" begin="0.3s" />
      </path>
      <path d="M56 26 Q66 16 66 4" fill="none" stroke="#0F5C5A" strokeWidth=".6" strokeLinecap="round" opacity="0">
        <animate attributeName="opacity" values="0;.25;0" dur="1.8s" repeatCount="indefinite" begin="0.6s" />
      </path>

      {/* WhatsApp-style chat bubble — pops in */}
      <g opacity="0">
        <animate attributeName="opacity" values="0;0;1;1" dur="3s" repeatCount="indefinite" />
        <rect x="5" y="36" width="18" height="12" rx="4" fill="#25D366" />
        <path d="M20 44 L24 48 L20 48 Z" fill="#25D366" />
        {/* Dots inside bubble */}
        <circle cx="10" cy="42" r="1.2" fill="white">
          <animate attributeName="opacity" values="1;.3;1" dur="1s" repeatCount="indefinite" />
        </circle>
        <circle cx="14" cy="42" r="1.2" fill="white">
          <animate attributeName="opacity" values="1;.3;1" dur="1s" repeatCount="indefinite" begin="0.2s" />
        </circle>
        <circle cx="18" cy="42" r="1.2" fill="white">
          <animate attributeName="opacity" values="1;.3;1" dur="1s" repeatCount="indefinite" begin="0.4s" />
        </circle>
      </g>
    </svg>
  );
}

/** Step 4 — Save searches & alerts: bell + notification + envelope */
export function SaveAlertsIllustration() {
  return (
    <svg viewBox="0 0 80 72" fill="none" aria-hidden="true" className="w-full h-full">
      {/* Bell */}
      <g>
        <animateTransform
          attributeName="transform" type="rotate"
          values="0 40 28; 8 40 28; -8 40 28; 4 40 28; -4 40 28; 0 40 28"
          dur="3s" repeatCount="indefinite"
        />
        {/* Bell body */}
        <path
          d="M30 34 C30 22 50 22 50 34 L52 40 L28 40 Z"
          fill="#E0F7FA" stroke="#0F5C5A" strokeWidth="1"
        />
        {/* Bell top ring */}
        <circle cx="40" cy="22" r="2.5" fill="none" stroke="#0F5C5A" strokeWidth="1" />
        {/* Clapper */}
        <circle cx="40" cy="42" r="2.5" fill="#0F5C5A" opacity=".5" />
      </g>

      {/* Notification badge — pulses */}
      <circle cx="52" cy="22" r="5" fill="#EF4444">
        <animate attributeName="r" values="5;6;5" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <text x="52" y="24.5" textAnchor="middle" fill="white" fontSize="6" fontWeight="700" fontFamily="system-ui,sans-serif">3</text>

      {/* Envelope — slides up from below */}
      <g>
        <animateTransform
          attributeName="transform" type="translate"
          values="0,12; 0,0" dur="0.5s" begin="1s" fill="freeze"
        />
        <g opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.4s" begin="1s" fill="freeze" />
          <rect x="22" y="50" width="22" height="14" rx="3" fill="white" stroke="#0F5C5A" strokeWidth=".8" />
          <path d="M22 52 L33 59 L44 52" fill="none" stroke="#0F5C5A" strokeWidth=".8" strokeLinejoin="round" />
          {/* Tiny star on envelope */}
          <circle cx="39" cy="55" r="2" fill="#FCD34D" />
        </g>
      </g>

      {/* Search saved icon */}
      <g opacity="0">
        <animate attributeName="opacity" values="0;1" dur="0.4s" begin="1.4s" fill="freeze" />
        <rect x="50" y="50" width="20" height="14" rx="3" fill="#E0F7FA" stroke="#B2DFDB" strokeWidth=".8" />
        <path d="M55 56 L59 60 L66 53" stroke="#0F5C5A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  );
}

/** Step 5 — Premium early access: crown / bolt + 24h clock */
export function PremiumIllustration() {
  return (
    <svg viewBox="0 0 80 72" fill="none" aria-hidden="true" className="w-full h-full">
      {/* Glowing circle backdrop */}
      <circle cx="40" cy="34" r="24" fill="#F0FDFA" opacity=".6" />

      {/* Lightning bolt — main icon */}
      <path
        d="M42 14 L34 34 L40 34 L36 54 L50 30 L43 30 L48 14 Z"
        fill="#0F5C5A" opacity=".85"
      >
        <animate attributeName="opacity" values=".85;1;.85" dur="2s" repeatCount="indefinite" />
      </path>

      {/* Sparkles */}
      <g>
        {/* Spark 1 — top right */}
        <line x1="56" y1="16" x2="56" y2="10" stroke="#0F5C5A" strokeWidth="1.2" strokeLinecap="round">
          <animate attributeName="opacity" values="0;1;0" dur="2.5s" repeatCount="indefinite" />
        </line>
        <line x1="53" y1="13" x2="59" y2="13" stroke="#0F5C5A" strokeWidth="1.2" strokeLinecap="round">
          <animate attributeName="opacity" values="0;1;0" dur="2.5s" repeatCount="indefinite" />
        </line>
        {/* Spark 2 — left */}
        <line x1="22" y1="26" x2="22" y2="20" stroke="#3A9E98" strokeWidth="1" strokeLinecap="round">
          <animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite" begin="0.8s" />
        </line>
        <line x1="19" y1="23" x2="25" y2="23" stroke="#3A9E98" strokeWidth="1" strokeLinecap="round">
          <animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite" begin="0.8s" />
        </line>
        {/* Spark 3 — bottom right */}
        <circle cx="58" cy="42" r="1.5" fill="#3A9E98">
          <animate attributeName="opacity" values="0;1;0" dur="1.8s" repeatCount="indefinite" begin="1.2s" />
          <animate attributeName="r" values="1;2;1" dur="1.8s" repeatCount="indefinite" begin="1.2s" />
        </circle>
      </g>

      {/* 24h badge */}
      <rect x="16" y="50" width="24" height="12" rx="6" fill="#0F5C5A" opacity="0">
        <animate attributeName="opacity" values="0;1" dur="0.4s" begin="0.6s" fill="freeze" />
      </rect>
      <text x="28" y="58.5" textAnchor="middle" fill="white" fontSize="6" fontWeight="700" fontFamily="system-ui,sans-serif" opacity="0">
        24h
        <animate attributeName="opacity" values="0;1" dur="0.4s" begin="0.6s" fill="freeze" />
      </text>

      {/* VIP star — bottom right */}
      <polygon
        points="60,52 62,58 68,58 63,62 65,68 60,64 55,68 57,62 52,58 58,58"
        fill="#FCD34D" stroke="#F59E0B" strokeWidth=".5" opacity="0"
      >
        <animate attributeName="opacity" values="0;1" dur="0.4s" begin="1s" fill="freeze" />
        <animateTransform
          attributeName="transform" type="rotate"
          values="0 60 60; 10 60 60; 0 60 60; -10 60 60; 0 60 60"
          dur="4s" repeatCount="indefinite" begin="1s"
        />
      </polygon>
    </svg>
  );
}

/* ═══════════════════════════════════════════════════
   Landlord illustrations (amber palette)
   ═══════════════════════════════════════════════════ */

/** Step 1 — Create account: form with fields filling + avatar */
export function CreateAccountIllustration() {
  return (
    <svg viewBox="0 0 80 72" fill="none" aria-hidden="true" className="w-full h-full">
      {/* Form card */}
      <rect x="14" y="4" width="52" height="62" rx="6" fill="white" stroke="#FCD34D" strokeWidth="1" />

      {/* Avatar circle */}
      <circle cx="40" cy="18" r="8" fill="#FEF3C7" stroke="#F59E0B" strokeWidth=".8" />
      <circle cx="40" cy="16" r="3" fill="#F59E0B" opacity=".4" />
      <path d="M33 24 Q40 28 47 24" fill="none" stroke="#F59E0B" strokeWidth=".8" opacity=".4" />

      {/* Field 1 — email */}
      <rect x="20" y="30" width="40" height="7" rx="2" fill="#FEF3C7" stroke="#FCD34D" strokeWidth=".5" />
      <rect x="23" y="33" width="0" height="2" rx="1" fill="#F59E0B" opacity=".6">
        <animate attributeName="width" values="0;24" dur="0.6s" begin="0.5s" fill="freeze" />
      </rect>

      {/* Field 2 — password */}
      <rect x="20" y="40" width="40" height="7" rx="2" fill="#FEF3C7" stroke="#FCD34D" strokeWidth=".5" />
      {/* Password dots appearing */}
      <g opacity="0">
        <animate attributeName="opacity" values="0;1" dur="0.3s" begin="1.2s" fill="freeze" />
        <circle cx="25" cy="43.5" r="1.5" fill="#F59E0B" opacity=".5" />
        <circle cx="30" cy="43.5" r="1.5" fill="#F59E0B" opacity=".5" />
        <circle cx="35" cy="43.5" r="1.5" fill="#F59E0B" opacity=".5" />
        <circle cx="40" cy="43.5" r="1.5" fill="#F59E0B" opacity=".5" />
        <circle cx="45" cy="43.5" r="1.5" fill="#F59E0B" opacity=".5" />
      </g>

      {/* Sign Up button */}
      <rect x="24" y="52" width="32" height="8" rx="4" fill="#F59E0B" opacity="0">
        <animate attributeName="opacity" values="0;1" dur="0.3s" begin="1.6s" fill="freeze" />
      </rect>
      <text x="40" y="58" textAnchor="middle" fill="white" fontSize="5" fontWeight="700" fontFamily="system-ui,sans-serif" opacity="0">
        Sign Up
        <animate attributeName="opacity" values="0;1" dur="0.3s" begin="1.6s" fill="freeze" />
      </text>

      {/* Animated cursor */}
      <rect x="23" y="31.5" width="1" height="4" fill="#F59E0B" opacity="0">
        <animate attributeName="opacity" values="0;0;1;1;0" dur="3s" repeatCount="indefinite" />
        <animate attributeName="x" values="23;47;47;23;23" dur="3s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
}

/** Step 2 — Add property: camera + photos dropping into a grid */
export function AddPropertyIllustration() {
  return (
    <svg viewBox="0 0 80 72" fill="none" aria-hidden="true" className="w-full h-full">
      {/* Listing card outline */}
      <rect x="8" y="10" width="64" height="52" rx="6" fill="white" stroke="#FCD34D" strokeWidth="1" />

      {/* Photo grid area */}
      <rect x="13" y="15" width="26" height="20" rx="3" fill="#FEF3C7" opacity="0">
        <animate attributeName="opacity" values="0;1" dur="0.3s" begin="0.2s" fill="freeze" />
      </rect>
      <rect x="41" y="15" width="12" height="9" rx="2" fill="#FEF3C7" opacity="0">
        <animate attributeName="opacity" values="0;1" dur="0.3s" begin="0.5s" fill="freeze" />
      </rect>
      <rect x="55" y="15" width="12" height="9" rx="2" fill="#FEF3C7" opacity="0">
        <animate attributeName="opacity" values="0;1" dur="0.3s" begin="0.7s" fill="freeze" />
      </rect>
      <rect x="41" y="26" width="26" height="9" rx="2" fill="#FEF3C7" opacity="0">
        <animate attributeName="opacity" values="0;1" dur="0.3s" begin="0.9s" fill="freeze" />
      </rect>

      {/* Mountain icon in main photo */}
      <path d="M18 30 L24 22 L30 28 L33 24 L38 32" stroke="#F59E0B" strokeWidth=".8" strokeLinejoin="round" fill="none" opacity="0">
        <animate attributeName="opacity" values="0;.5" dur="0.3s" begin="0.4s" fill="freeze" />
      </path>

      {/* Detail lines */}
      <rect x="13" y="40" width="32" height="2.5" rx="1" fill="#FCD34D" opacity="0">
        <animate attributeName="opacity" values="0;1" dur="0.3s" begin="1.1s" fill="freeze" />
      </rect>
      <rect x="13" y="45" width="24" height="2.5" rx="1" fill="#FEF3C7" opacity="0">
        <animate attributeName="opacity" values="0;1" dur="0.3s" begin="1.3s" fill="freeze" />
      </rect>

      {/* Location pin */}
      <g opacity="0">
        <animate attributeName="opacity" values="0;1" dur="0.3s" begin="1.5s" fill="freeze" />
        <animateTransform
          attributeName="transform" type="translate"
          values="0,-6; 0,0" dur="0.4s" begin="1.5s" fill="freeze"
        />
        <path d="M57 42 C57 38 63 38 63 42 C63 46 60 50 60 50 C60 50 57 46 57 42Z" fill="#F59E0B" opacity=".8" />
        <circle cx="60" cy="42" r="1.5" fill="white" />
      </g>

      {/* Price tag */}
      <rect x="13" y="51" width="18" height="6" rx="3" fill="#F59E0B" opacity="0">
        <animate attributeName="opacity" values="0;1" dur="0.3s" begin="1.7s" fill="freeze" />
      </rect>
      <text x="22" y="56" textAnchor="middle" fill="white" fontSize="4" fontWeight="700" fontFamily="system-ui,sans-serif" opacity="0">
        LKR/mo
        <animate attributeName="opacity" values="0;1" dur="0.3s" begin="1.7s" fill="freeze" />
      </text>

      {/* Camera icon — top-right */}
      <g opacity=".7">
        <animateTransform attributeName="transform" type="scale" values="1;1.08;1" dur="2s" repeatCount="indefinite" additive="sum" />
        <rect x="52" y="44" width="14" height="10" rx="3" fill="none" stroke="#F59E0B" strokeWidth="1" />
        <circle cx="59" cy="49" r="3" fill="none" stroke="#F59E0B" strokeWidth=".8" />
        <rect x="56" y="43" width="6" height="2" rx="1" fill="#F59E0B" opacity=".4" />
      </g>
    </svg>
  );
}

/** Step 3 — Verification: shield drawing + checkmark */
export function VerificationIllustration() {
  return (
    <svg viewBox="0 0 80 72" fill="none" aria-hidden="true" className="w-full h-full">
      {/* Shield outline — draws itself */}
      <path
        d="M40 8 L58 18 C58 18 60 40 40 58 C20 40 22 18 22 18 Z"
        fill="#FEF3C7" fillOpacity=".5"
        stroke="#F59E0B" strokeWidth="1.5" strokeLinejoin="round"
        strokeDasharray="140" strokeDashoffset="140"
      >
        <animate attributeName="stroke-dashoffset" from="140" to="0" dur="1.2s" fill="freeze" />
      </path>

      {/* Inner shield fill */}
      <path
        d="M40 14 L54 22 C54 22 55 40 40 54 C25 40 26 22 26 22 Z"
        fill="#FEF3C7" opacity="0"
      >
        <animate attributeName="opacity" values="0;.6" dur="0.4s" begin="1s" fill="freeze" />
      </path>

      {/* Checkmark — draws after shield */}
      <path
        d="M32 34 L38 42 L50 26"
        fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="36" strokeDashoffset="36"
      >
        <animate attributeName="stroke-dashoffset" from="36" to="0" dur="0.5s" begin="1.2s" fill="freeze" />
      </path>

      {/* Green glow after verified */}
      <circle cx="40" cy="34" r="18" fill="none" stroke="#16A34A" strokeWidth="1" opacity="0">
        <animate attributeName="opacity" values="0;.3;0" dur="1.5s" begin="1.7s" repeatCount="indefinite" />
        <animate attributeName="r" values="18;24;18" dur="1.5s" begin="1.7s" repeatCount="indefinite" />
      </circle>

      {/* "Verified" badge at bottom */}
      <rect x="23" y="58" width="34" height="10" rx="5" fill="#16A34A" opacity="0">
        <animate attributeName="opacity" values="0;1" dur="0.3s" begin="1.8s" fill="freeze" />
      </rect>
      <text x="40" y="65" textAnchor="middle" fill="white" fontSize="5" fontWeight="700" fontFamily="system-ui,sans-serif" opacity="0">
        Verified
        <animate attributeName="opacity" values="0;1" dur="0.3s" begin="1.8s" fill="freeze" />
      </text>
    </svg>
  );
}

/** Step 4 — Manage listing: dashboard card with toggle + status */
export function ManageListingIllustration() {
  return (
    <svg viewBox="0 0 80 72" fill="none" aria-hidden="true" className="w-full h-full">
      {/* Dashboard card */}
      <rect x="8" y="6" width="64" height="60" rx="6" fill="white" stroke="#FCD34D" strokeWidth="1" />
      {/* Header bar */}
      <rect x="8" y="6" width="64" height="12" rx="6" fill="#F59E0B" opacity=".15" />
      <circle cx="16" cy="12" r="2" fill="#F59E0B" opacity=".4" />
      <rect x="22" y="10" width="20" height="3" rx="1.5" fill="#F59E0B" opacity=".3" />

      {/* Status row */}
      <text x="14" y="28" fill="#78716C" fontSize="4.5" fontFamily="system-ui,sans-serif">Status</text>
      {/* Toggle — animates on/off */}
      <rect x="44" y="22" width="18" height="9" rx="4.5" fill="#D1D5DB">
        <animate attributeName="fill" values="#D1D5DB;#16A34A;#16A34A;#D1D5DB" dur="4s" repeatCount="indefinite" />
      </rect>
      <circle cx="49" cy="26.5" r="3.5" fill="white">
        <animate attributeName="cx" values="49;57;57;49" dur="4s" repeatCount="indefinite" />
      </circle>

      {/* Active badge */}
      <rect x="14" y="33" width="24" height="7" rx="3.5" fill="#DCFCE7" stroke="#BBF7D0" strokeWidth=".5">
        <animate attributeName="fill" values="#DCFCE7;#DCFCE7;#FEF3C7;#DCFCE7" dur="4s" repeatCount="indefinite" />
      </rect>
      <text x="26" y="38" textAnchor="middle" fill="#16A34A" fontSize="4" fontWeight="600" fontFamily="system-ui,sans-serif">
        Active
        <animate attributeName="fill" values="#16A34A;#16A34A;#D97706;#16A34A" dur="4s" repeatCount="indefinite" />
      </text>

      {/* Stats row */}
      <rect x="14" y="44" width="14" height="14" rx="3" fill="#FEF3C7" />
      <text x="21" y="50" textAnchor="middle" fill="#F59E0B" fontSize="7" fontWeight="700" fontFamily="system-ui,sans-serif">12</text>
      <text x="21" y="55.5" textAnchor="middle" fill="#92400E" fontSize="3.5" fontFamily="system-ui,sans-serif">Views</text>

      <rect x="33" y="44" width="14" height="14" rx="3" fill="#FEF3C7" />
      <text x="40" y="50" textAnchor="middle" fill="#F59E0B" fontSize="7" fontWeight="700" fontFamily="system-ui,sans-serif">5</text>
      <text x="40" y="55.5" textAnchor="middle" fill="#92400E" fontSize="3.5" fontFamily="system-ui,sans-serif">Calls</text>

      {/* Edit pencil icon */}
      <g opacity="0">
        <animate attributeName="opacity" values="0;.7;0" dur="3s" repeatCount="indefinite" />
        <rect x="54" y="44" width="14" height="14" rx="3" fill="#FEF3C7" />
        <path d="M58 54 L63 49 L65 51 L60 56 Z" fill="#F59E0B" opacity=".7" />
        <line x1="57" y1="56" x2="61" y2="56" stroke="#F59E0B" strokeWidth=".8" strokeLinecap="round" opacity=".7" />
      </g>
    </svg>
  );
}

/** Step 5 — Tenants contact you: phone with incoming notifications */
export function TenantsContactIllustration() {
  return (
    <svg viewBox="0 0 80 72" fill="none" aria-hidden="true" className="w-full h-full">
      {/* Phone body */}
      <rect x="26" y="10" width="28" height="52" rx="5" fill="white" stroke="#F59E0B" strokeWidth="1.2" />
      <rect x="29" y="16" width="22" height="38" rx="2" fill="#FEF3C7" />
      <rect x="36" y="12" width="8" height="2" rx="1" fill="#FCD34D" />

      {/* Notification 1 — slides down */}
      <g>
        <animateTransform attributeName="transform" type="translate" values="0,-8; 0,0" dur="0.4s" begin="0.5s" fill="freeze" />
        <g opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.3s" begin="0.5s" fill="freeze" />
          <rect x="31" y="19" width="18" height="10" rx="3" fill="white" stroke="#FCD34D" strokeWidth=".5" />
          <circle cx="35" cy="24" r="2.5" fill="#F59E0B" opacity=".4" />
          <rect x="39" y="22" width="8" height="1.5" rx=".75" fill="#FCD34D" />
          <rect x="39" y="25" width="5" height="1.5" rx=".75" fill="#FEF3C7" />
        </g>
      </g>

      {/* Notification 2 */}
      <g>
        <animateTransform attributeName="transform" type="translate" values="0,-8; 0,0" dur="0.4s" begin="1.2s" fill="freeze" />
        <g opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.3s" begin="1.2s" fill="freeze" />
          <rect x="31" y="31" width="18" height="10" rx="3" fill="white" stroke="#FCD34D" strokeWidth=".5" />
          <circle cx="35" cy="36" r="2.5" fill="#25D366" opacity=".5" />
          <rect x="39" y="34" width="8" height="1.5" rx=".75" fill="#FCD34D" />
          <rect x="39" y="37" width="6" height="1.5" rx=".75" fill="#FEF3C7" />
        </g>
      </g>

      {/* Notification 3 */}
      <g>
        <animateTransform attributeName="transform" type="translate" values="0,-8; 0,0" dur="0.4s" begin="1.9s" fill="freeze" />
        <g opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.3s" begin="1.9s" fill="freeze" />
          <rect x="31" y="43" width="18" height="10" rx="3" fill="white" stroke="#FCD34D" strokeWidth=".5" />
          <circle cx="35" cy="48" r="2.5" fill="#F59E0B" opacity=".4" />
          <rect x="39" y="46" width="8" height="1.5" rx=".75" fill="#FCD34D" />
          <rect x="39" y="49" width="7" height="1.5" rx=".75" fill="#FEF3C7" />
        </g>
      </g>

      {/* Badge count */}
      <circle cx="52" cy="14" r="6" fill="#EF4444" opacity="0">
        <animate attributeName="opacity" values="0;0;1" dur="2.4s" fill="freeze" />
      </circle>
      <text x="52" y="16.5" textAnchor="middle" fill="white" fontSize="6" fontWeight="700" fontFamily="system-ui,sans-serif" opacity="0">
        3
        <animate attributeName="opacity" values="0;0;1" dur="2.4s" fill="freeze" />
      </text>

      {/* Chat bubbles outside — left side */}
      <g opacity="0">
        <animate attributeName="opacity" values="0;.7;0" dur="3s" repeatCount="indefinite" begin="2.5s" />
        <rect x="4" y="22" width="16" height="8" rx="3" fill="#25D366" />
        <path d="M18 28 L21 31 L18 30Z" fill="#25D366" />
        <text x="12" y="28" textAnchor="middle" fill="white" fontSize="4" fontFamily="system-ui,sans-serif">Hi!</text>
      </g>
      <g opacity="0">
        <animate attributeName="opacity" values="0;.6;0" dur="3s" repeatCount="indefinite" begin="3.5s" />
        <rect x="4" y="38" width="18" height="8" rx="3" fill="#F59E0B" opacity=".8" />
        <path d="M20 44 L23 47 L20 46Z" fill="#F59E0B" opacity=".8" />
        <text x="13" y="44" textAnchor="middle" fill="white" fontSize="3.5" fontFamily="system-ui,sans-serif">Call?</text>
      </g>
    </svg>
  );
}

/** Step 6 — Boost visibility: listing card with upward sparkle + badge */
export function BoostVisibilityIllustration() {
  return (
    <svg viewBox="0 0 80 72" fill="none" aria-hidden="true" className="w-full h-full">
      {/* Listing card */}
      <rect x="16" y="16" width="48" height="44" rx="6" fill="white" stroke="#FCD34D" strokeWidth="1" />
      <rect x="20" y="20" width="22" height="14" rx="3" fill="#FEF3C7" />
      <rect x="20" y="38" width="30" height="2.5" rx="1" fill="#FCD34D" />
      <rect x="20" y="43" width="22" height="2.5" rx="1" fill="#FEF3C7" />
      <rect x="20" y="48" width="16" height="6" rx="3" fill="#F59E0B" opacity=".3" />

      {/* Up arrow — animated */}
      <g>
        <animateTransform
          attributeName="transform" type="translate"
          values="0,4; 0,-2; 0,4"
          dur="2.5s" repeatCount="indefinite"
        />
        <path d="M56 36 L60 28 L64 36" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="60" y1="30" x2="60" y2="44" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* Sparkle trail */}
      <circle cx="52" cy="20" r="1.5" fill="#FCD34D">
        <animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite" />
        <animate attributeName="cy" values="22;14;22" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="60" cy="16" r="1" fill="#F59E0B">
        <animate attributeName="opacity" values="0;1;0" dur="1.8s" repeatCount="indefinite" begin="0.4s" />
        <animate attributeName="cy" values="18;10;18" dur="1.8s" repeatCount="indefinite" begin="0.4s" />
      </circle>
      <circle cx="67" cy="22" r="1.2" fill="#FCD34D">
        <animate attributeName="opacity" values="0;1;0" dur="2.2s" repeatCount="indefinite" begin="0.8s" />
        <animate attributeName="cy" values="24;16;24" dur="2.2s" repeatCount="indefinite" begin="0.8s" />
      </circle>

      {/* "Featured" badge — pops in */}
      <rect x="2" y="4" width="34" height="10" rx="5" fill="#F59E0B" opacity="0">
        <animate attributeName="opacity" values="0;1;1;0" dur="5s" repeatCount="indefinite" />
      </rect>
      <text x="19" y="11" textAnchor="middle" fill="white" fontSize="5" fontWeight="700" fontFamily="system-ui,sans-serif" opacity="0">
        Featured
        <animate attributeName="opacity" values="0;1;1;0" dur="5s" repeatCount="indefinite" />
      </text>

      {/* "Boost" badge — alternates with Featured */}
      <rect x="5" y="4" width="28" height="10" rx="5" fill="#0F5C5A" opacity="0">
        <animate attributeName="opacity" values="0;0;0;1;1;0" dur="5s" repeatCount="indefinite" begin="2.5s" />
      </rect>
      <text x="19" y="11" textAnchor="middle" fill="white" fontSize="5" fontWeight="700" fontFamily="system-ui,sans-serif" opacity="0">
        Boost
        <animate attributeName="opacity" values="0;0;0;1;1;0" dur="5s" repeatCount="indefinite" begin="2.5s" />
      </text>
    </svg>
  );
}
