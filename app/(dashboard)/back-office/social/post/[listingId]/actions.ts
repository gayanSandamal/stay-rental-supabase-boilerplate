'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import { logListingAction } from '@/lib/db/audit-logger';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { publishNow } from '@/lib/social/publish';

/**
 * Post one listing to TikTok, on an operator's explicit click.
 *
 * The privacy level is REQUIRED and is never defaulted here. TikTok's Direct
 * Post rules put that choice with the creator, and a server action that quietly
 * filled in `PUBLIC_TO_EVERYONE` when the select was left alone would defeat
 * the whole point of the screen. An absent or unrecognised value bounces back
 * to the form rather than posting something nobody chose.
 *
 * Validation is re-done here rather than trusted from the client: the options
 * rendered in the form came from TikTok, but a form POST can carry anything.
 * The adapter checks it a third time against a live `creator_info` call, which
 * is the only check that can see the account's CURRENT permissions.
 */

const PRIVACY_LEVELS = new Set([
  'PUBLIC_TO_EVERYONE',
  'MUTUAL_FOLLOW_FRIENDS',
  'FOLLOWER_OF_CREATOR',
  'SELF_ONLY',
]);

export async function postToTikTokAction(formData: FormData): Promise<void> {
  const user = await requireBackOfficeAccess();

  const listingId = Number(formData.get('listingId'));
  if (!Number.isFinite(listingId) || listingId <= 0) redirect('/back-office/social');

  const base = `/back-office/social/post/${listingId}`;
  const privacyLevel = String(formData.get('privacyLevel') ?? '');

  if (!PRIVACY_LEVELS.has(privacyLevel)) {
    redirect(`${base}?error=privacy_required`);
  }

  await loadFeatureFlags();

  const result = await publishNow(listingId, 'tiktok', { privacyLevel });

  await logListingAction('listing_social_published', listingId, user.id, {
    platform: 'tiktok',
    source: 'back_office_manual',
    privacyLevel,
    outcome: result.outcome,
  }).catch(() => {});

  revalidatePath(base);
  revalidatePath('/back-office/social');

  if (result.ok) redirect(`${base}?posted=1`);

  // `manual` from publishNow means the row could not be claimed — either it is
  // already posted, or a cron tick holds a live lease on it. Both are "someone
  // else is doing this", not a failure of the operator's click.
  if (result.outcome === 'manual') redirect(`${base}?error=already_handled`);
  redirect(`${base}?error=failed`);
}
