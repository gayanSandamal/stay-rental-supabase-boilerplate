import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import { db } from '@/lib/db/drizzle';
import { whatsappIntakes } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageCircle, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { IntakeActions } from './intake-actions';

export const dynamic = 'force-dynamic';

const STATUS_STYLES: Record<string, string> = {
  received: 'bg-sky-100 text-sky-800',
  needs_info: 'bg-amber-100 text-amber-800',
  published: 'bg-emerald-100 text-emerald-800',
  manual_review: 'bg-rose-100 text-rose-800',
  rejected: 'bg-slate-200 text-slate-700',
};

export default async function WhatsAppIntakesPage() {
  await requireBackOfficeAccess();

  const intakes = await db.query.whatsappIntakes.findMany({
    orderBy: [desc(whatsappIntakes.lastMessageAt)],
    limit: 100,
  });

  const mediaCount = (s: string | null) => {
    try {
      const v = JSON.parse(s ?? '[]');
      return Array.isArray(v) ? v.length : 0;
    } catch {
      return 0;
    }
  };

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="flex items-center gap-3 mb-6">
        <MessageCircle className="h-6 w-6 text-teal-700" />
        <h1 className="text-2xl font-bold text-slate-900">WhatsApp Intakes</h1>
      </div>

      {intakes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            No WhatsApp submissions yet. When landlords message the concierge
            number, their submissions appear here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {intakes.map((intake) => (
            <Card key={intake.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-3 text-base">
                  <span className={`px-2 py-0.5 text-xs rounded-full font-semibold ${STATUS_STYLES[intake.status] ?? ''}`}>
                    {intake.status.replace('_', ' ')}
                  </span>
                  <span className="font-semibold">
                    {intake.profileName ?? 'Unknown'} · +{intake.fromNumber}
                  </span>
                  <span className="text-xs text-slate-500 font-normal">
                    {mediaCount(intake.mediaPaths)} photo(s) ·{' '}
                    {new Date(intake.lastMessageAt).toLocaleString()}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {intake.messageText && (
                  <p className="text-sm text-slate-700 whitespace-pre-wrap line-clamp-4">
                    {intake.messageText}
                  </p>
                )}
                {intake.failureReason && (
                  <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                    {intake.failureReason}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  {intake.listingId && (
                    <Link
                      href={`/dashboard/listings/${intake.listingId}`}
                      className="inline-flex items-center gap-1 text-sm text-teal-700 font-medium hover:underline"
                    >
                      Listing #{intake.listingId}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  )}
                  <IntakeActions intakeId={intake.id} status={intake.status} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
