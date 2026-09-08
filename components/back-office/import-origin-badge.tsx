import { Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
// From origin-label, never origin: the latter imports Drizzle, and this badge
// renders inside client components.
import { originLabel, resolvedViaLabel, type ListingOrigin } from '@/lib/imports/origin-label';

/**
 * Marks a listing that came from an imported post.
 *
 * `outline` rather than a STATUS_TONE entry: that table is documented as
 * lifecycle-only, and an origin is not a lifecycle. Carries visible text as well
 * as the icon, per the badge module's rule that status is never colour alone.
 */
export function ImportOriginBadge({ origin }: { origin: ListingOrigin }) {
  return (
    <Badge
      variant="outline"
      title={`${origin.sourceUrl} — ${resolvedViaLabel(origin.resolvedVia)}`}
    >
      <Download />
      {originLabel(origin)}
    </Badge>
  );
}
