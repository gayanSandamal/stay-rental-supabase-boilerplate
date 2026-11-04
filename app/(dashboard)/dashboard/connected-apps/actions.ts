'use server';

import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/db/queries';
import { assertNotImpersonating } from '@/lib/auth/assert-not-impersonating';
import { revokeGrantForUser } from '@/lib/mcp/oauth/store';

/**
 * Disconnect an app. Scoped to the signed-in user inside revokeGrantForUser's
 * WHERE clause, so a grant id from another account revokes nothing. The next
 * call the app makes with its token gets a 401, and its refresh token is dead.
 */
export async function revokeConnectedApp(formData: FormData): Promise<void> {
  await assertNotImpersonating();
  const user = await getUser();
  if (!user) return;
  const grantId = Number(formData.get('grantId'));
  if (!Number.isInteger(grantId) || grantId <= 0) return;
  await revokeGrantForUser(user.id, grantId);
  revalidatePath('/dashboard/connected-apps');
}
