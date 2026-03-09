import { notFound } from 'next/navigation';
import { AddTeamMemberForm } from './add-team-member-form';
import { db } from '@/lib/db/drizzle';
import { businessAccounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';

export default async function AddTeamMemberPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  await requireBackOfficeAccess();

  const resolvedParams = params instanceof Promise ? await params : params;
  const accountId = Number(resolvedParams.id);

  if (isNaN(accountId) || accountId <= 0) {
    notFound();
  }

  const account = await db.query.businessAccounts.findFirst({
    where: eq(businessAccounts.id, accountId),
  });

  if (!account) {
    notFound();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Add Team Member to {account.name}
      </h1>
      <AddTeamMemberForm businessAccountId={accountId} />
    </div>
  );
}

