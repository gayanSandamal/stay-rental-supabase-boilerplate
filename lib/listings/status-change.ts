/**
 * What picking a value in the back-office "Current Status" dropdown does.
 *
 * The dropdown used to PATCH `{ status }` straight through, which made it a
 * second, weaker copy of the two buttons beside it:
 *
 * - "Active" published the listing and notified the landlord exactly like
 *   Approve & Activate, but left Verified at No — the only difference between
 *   the two, invisible to the operator.
 * - "Rejected" sent no reason, and `/api/listings/[id]` only notifies the
 *   landlord (email and WhatsApp) when there is one, so the landlord was
 *   rejected in silence. Reject Listing asks for the reason.
 *
 * So those two values now take the buttons' paths, and there is one way to
 * approve and one way to reject. Import-free: the form is a client component.
 */
export type StatusChange =
  | { kind: 'none' }
  | { kind: 'approve' }
  | { kind: 'reject' }
  | { kind: 'update'; status: 'pending' | 'rented' | 'archived' };

/** Values an operator can pick. `expired` is set by the expiry cron only. */
export const SELECTABLE_STATUSES = ['pending', 'active', 'rented', 'archived', 'rejected'] as const;

export function statusChangeFor(current: string, next: string): StatusChange {
  if (next === current) return { kind: 'none' };
  switch (next) {
    case 'active':
      return { kind: 'approve' };
    case 'rejected':
      return { kind: 'reject' };
    case 'pending':
    case 'rented':
    case 'archived':
      return { kind: 'update', status: next };
    default:
      // `expired`, or anything a hand-edited DOM sends: never PATCH it.
      return { kind: 'none' };
  }
}

/**
 * The options to render. A listing the cron expired must SHOW as Expired —
 * with no matching option a controlled <select> falls back to its first
 * option, so an expired listing read "Pending". It is shown, not selectable.
 */
export function statusOptions(
  current: string,
): Array<{ value: string; label: string; disabled: boolean }> {
  const labels: Record<string, string> = {
    pending: 'Pending',
    active: 'Active (approve & verify)',
    rented: 'Rented',
    archived: 'Archived',
    rejected: 'Rejected (asks for a reason)',
  };
  const options: Array<{ value: string; label: string; disabled: boolean }> =
    SELECTABLE_STATUSES.map((value) => ({
      value,
      label: labels[value],
      disabled: false,
    }));
  if (!(SELECTABLE_STATUSES as readonly string[]).includes(current)) {
    const label = current.charAt(0).toUpperCase() + current.slice(1);
    options.push({ value: current, label, disabled: true });
  }
  return options;
}
