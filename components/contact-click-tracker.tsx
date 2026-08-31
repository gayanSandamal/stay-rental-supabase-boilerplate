'use client';

import type { ReactNode } from 'react';
import type { ContactChannel } from '@/lib/analytics/contact-events';

/**
 * A Call / WhatsApp link that also records the tap.
 *
 * THE LINK IS NEVER GATED ON THE BEACON. There is no `preventDefault`, no
 * `await`, and no state: the browser follows the `href` exactly as it would for
 * a plain anchor, and the beacon either goes or does not. A renter with an
 * ad-blocker, an offline connection, or a blocked endpoint still gets the
 * dialer — analytics that can stop a landlord being phoned would be worse than
 * no analytics.
 *
 * `sendBeacon` is used because it survives the page being torn down by the
 * navigation the same tap starts; `fetch(…, { keepalive: true })` is the
 * fallback where it is unavailable or refuses to queue.
 */
export function ContactLink({
  listingId,
  channel,
  contactNumberId,
  href,
  className,
  target,
  rel,
  children,
}: {
  listingId: number;
  channel: ContactChannel;
  /** The listing_contact_numbers row, when the number came from one. */
  contactNumberId?: number;
  href: string;
  className?: string;
  target?: string;
  rel?: string;
  children: ReactNode;
}) {
  function record() {
    try {
      const url = `/api/listings/${listingId}/contact`;
      const payload = JSON.stringify({ channel, contactNumberId });

      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const queued = navigator.sendBeacon(
          url,
          new Blob([payload], { type: 'application/json' })
        );
        if (queued) return;
      }

      void fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {
        // Non-critical: the tap has already navigated.
      });
    } catch {
      // Same. Nothing here may throw into the click handler.
    }
  }

  return (
    <a href={href} className={className} target={target} rel={rel} onClick={record}>
      {children}
    </a>
  );
}
