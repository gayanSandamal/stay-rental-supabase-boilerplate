import { redirect } from 'next/navigation';
import { getUser, getLeadById } from '@/lib/db/queries';
import { ScheduleViewingForm } from './schedule-viewing-form';

export default async function ScheduleViewingPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string }> | { leadId?: string };
}) {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const resolvedParams = searchParams instanceof Promise ? await searchParams : searchParams;
  const leadIdParam = resolvedParams.leadId;
  const leadId = leadIdParam ? Number(leadIdParam) : null;

  let lead = null;
  if (leadId && !isNaN(leadId)) {
    lead = await getLeadById(leadId);
  }

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="max-w-xl">
        <h1 className="text-lg lg:text-2xl font-medium mb-2">Schedule Viewing</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Schedule a property viewing for a lead. The tenant and landlord will be notified.
        </p>

        <ScheduleViewingForm leadId={leadId} lead={lead ?? null} />
      </div>
    </section>
  );
}
