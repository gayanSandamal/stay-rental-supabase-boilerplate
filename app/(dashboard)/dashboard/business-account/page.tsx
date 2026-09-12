import { getUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { businessAccountMembers, businessAccounts, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CreateBusinessAccountForm,
  InviteTeamMemberForm,
  RemoveTeamMemberButton,
} from './self-serve-forms';

/**
 * Landlord/broker self-serve business account — before this, provisioning
 * was 100% back-office (STATUS.md, _bmad-output/planning-artifacts/
 * broker-pivot/). Gated: renders an explainer, not a 404, when the flag is
 * off, matching the pattern other flag-gated dashboard pages use.
 */
export default async function BusinessAccountPage() {
  await loadFeatureFlags();
  const user = await getUser();
  if (!user) redirect('/sign-in');

  if (!isFeatureEnabled('enableSelfServeBusinessAccounts')) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Business Account</h1>
        <p className="text-gray-600">
          Self-serve business accounts (for brokerages managing multiple landlords'
          properties) aren't turned on yet. Contact support if you manage more than one
          landlord's listings and want early access.
        </p>
      </div>
    );
  }

  const membership = await db.query.businessAccountMembers.findFirst({
    where: eq(businessAccountMembers.userId, user.id),
  });

  if (!membership) {
    return (
      <div className="max-w-2xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Business Account</h1>
          <p className="text-gray-600">
            Create a business account to manage listings for a brokerage or a portfolio
            of properties under one name, with team members who can help manage them.
          </p>
        </div>
        <CreateBusinessAccountForm />
      </div>
    );
  }

  const account = await db.query.businessAccounts.findFirst({
    where: eq(businessAccounts.id, membership.businessAccountId),
  });
  if (!account) redirect('/dashboard');

  const members = await db
    .select({
      id: businessAccountMembers.id,
      role: businessAccountMembers.role,
      isActive: businessAccountMembers.isActive,
      userName: users.name,
      userEmail: users.email,
    })
    .from(businessAccountMembers)
    .innerJoin(users, eq(users.id, businessAccountMembers.userId))
    .where(eq(businessAccountMembers.businessAccountId, account.id));

  const canManage = membership.role === 'owner' || membership.role === 'admin';

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{account.name}</h1>
        <p className="text-sm text-gray-500">
          {account.kycVerified ? 'Verified business account' : 'Not yet verified'} · Your role:{' '}
          {membership.role}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between text-sm">
              <span>
                {m.userName ?? m.userEmail} <span className="text-gray-400">· {m.role}</span>
              </span>
              {canManage && m.userEmail !== user.email && (
                <RemoveTeamMemberButton businessAccountId={account.id} memberId={m.id} />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Invite a team member</CardTitle>
          </CardHeader>
          <CardContent>
            <InviteTeamMemberForm businessAccountId={account.id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
