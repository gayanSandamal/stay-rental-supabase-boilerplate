'use client';

import { useEffect } from 'react';

/**
 * Fires a POST to record a view when the listing is displayed.
 * Only for active listings (caller should check).
 */
export function ListingViewTracker({ listingId }: { listingId: number }) {
  useEffect(() => {
    fetch(`/api/listings/${listingId}/view`, { method: 'POST' }).catch(() => {
      // Ignore errors - view tracking is non-critical
    });
  }, [listingId]);

  return null;
}
