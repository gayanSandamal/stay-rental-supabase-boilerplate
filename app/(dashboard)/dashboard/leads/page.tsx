import { getUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { brokerLeads, businessAccountMembers } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { Card, CardContent } from '@/components/ui/card';
import { ClaimLeadButton } from './claim-lead-button';

/**
 * Broker lead inbox (FORGE.md Concept 3, gated by enableLeadRouting — the
 * least-validated of the three broker-pivot concepts). Business-account
 * members only; a plain landlord with no business account sees the
 * explainer, same pattern as the business-account page.
 */
export default async function LeadsPage() {
  await loadFeatureFlags();
  const user = await getUser();
  if (!user) redirect('/sign-in');

  if (!isFeatureEnabled('enableLeadRouting')) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Leads</h1>
        <p className="text-gray-600">Lead routing isn't turned on yet.</p>
      </div>
    );
  }

  const isAdminOrOps = user.role === 'admin' || user.role === 'ops';
  if (!isAdminOrOps) {
    const membership = await db.query.businessAccountMembers.findFirst({
      where: and(
        eq(businessAccountMembers.userId, user.id),
        eq(businessAccountMembers.isActive, true)
      ),
    });
    if (!membership) {
      return (
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Leads</h1>
          <p className="text-gray-600">
            Leads are visible to members of a business account. Create one from{' '}
            <a href="/dashboard/business-account" className="underline">
              Business Account
            </a>{' '}
            first.
          </p>
        </div>
      );
    }
  }

  const openLeads = await db
    .select()
    .from(brokerLeads)
    .where(eq(brokerLeads.status, 'open'))
    .orderBy(desc(brokerLeads.createdAt))
    .limit(50);

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Leads</h1>
        <p className="text-sm text-gray-500">
          Renter requirements posted through Easy Rent. First to claim gets the contact
          details — claiming is first-come, not exclusive beyond that.
        </p>
      </div>

      {openLeads.length === 0 && (
        <p className="text-sm text-gray-500">No open leads right now.</p>
      )}

      {openLeads.map((lead) => (
        <Card key={lead.id}>
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-gray-900">
                {lead.city}
                {lead.district ? `, ${lead.district}` : ''}
                {lead.bedrooms ? ` · ${lead.bedrooms}BR` : ''}
              </span>
              <span className="text-xs text-gray-400">
                {new Date(lead.createdAt).toLocaleDateString()}
              </span>
            </div>
            {(lead.budgetMin || lead.budgetMax) && (
              <p className="text-xs text-gray-600">
                Budget: LKR {lead.budgetMin ?? '?'} – {lead.budgetMax ?? '?'}
              </p>
            )}
            {lead.notes && <p className="text-xs text-gray-600">{lead.notes}</p>}
            <ClaimLeadButton leadId={lead.id} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
