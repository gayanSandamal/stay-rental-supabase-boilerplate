/**
 * Compact relative age — "3d", "5h", "just now".
 *
 * Rows show age rather than a full timestamp because an operator scanning a
 * queue needs "how overdue" at a glance, not a date. The exact timestamp lives
 * in the row's `title` attribute and in the detail drawer.
 */
export function shortAge(iso: string | Date): string {
  const then = typeof iso === 'string' ? new Date(iso) : iso;
  const minutes = Math.floor((Date.now() - then.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

/** "3 days", "5 hours" — the long form, for banner copy that reads as prose. */
export function longAge(since: Date | string): string {
  const then = typeof since === 'string' ? new Date(since) : since;
  const hours = Math.floor((Date.now() - then.getTime()) / 3_600_000);
  if (hours < 1) return 'under an hour';
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

/** Full timestamp for tooltips and drawers. */
export function fullTimestamp(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleString();
}
