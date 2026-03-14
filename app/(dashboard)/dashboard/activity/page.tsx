import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PlusCircle,
  Edit,
  CheckCircle,
  XCircle,
  Archive,
  Clock,
  Trash2,
  Users,
  Eye,
  UserPlus,
  UserMinus,
  PhoneCall,
  ShieldCheck,
  Download,
  Calendar,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { getRecentAuditLogs } from '@/lib/db/queries';

type AuditAction =
  | 'listing_created'
  | 'listing_updated'
  | 'listing_approved'
  | 'listing_rejected'
  | 'listing_archived'
  | 'listing_expired'
  | 'listing_deleted'
  | 'lead_created'
  | 'lead_status_changed'
  | 'viewing_scheduled'
  | 'viewing_outcome'
  | 'user_created'
  | 'user_updated'
  | 'business_account_created'
  | 'business_account_updated'
  | 'member_added'
  | 'member_removed'
  | 'contact_verified'
  | 'kyc_verified'
  | 'property_visited'
  | 'data_exported';

const iconMap: Record<AuditAction, LucideIcon> = {
  listing_created: PlusCircle,
  listing_updated: Edit,
  listing_approved: CheckCircle,
  listing_rejected: XCircle,
  listing_archived: Archive,
  listing_expired: Clock,
  listing_deleted: Trash2,
  lead_created: Users,
  lead_status_changed: Settings,
  viewing_scheduled: Calendar,
  viewing_outcome: Eye,
  user_created: UserPlus,
  user_updated: Edit,
  business_account_created: PlusCircle,
  business_account_updated: Edit,
  member_added: UserPlus,
  member_removed: UserMinus,
  contact_verified: PhoneCall,
  kyc_verified: ShieldCheck,
  property_visited: Eye,
  data_exported: Download,
};

const colorMap: Record<AuditAction, string> = {
  listing_created: 'bg-emerald-100 text-emerald-600',
  listing_updated: 'bg-teal-100 text-teal-800',
  listing_approved: 'bg-emerald-100 text-emerald-600',
  listing_rejected: 'bg-red-100 text-red-600',
  listing_archived: 'bg-slate-100 text-slate-600',
  listing_expired: 'bg-amber-100 text-amber-600',
  listing_deleted: 'bg-red-100 text-red-600',
  lead_created: 'bg-teal-100 text-teal-700',
  lead_status_changed: 'bg-teal-100 text-teal-800',
  viewing_scheduled: 'bg-teal-100 text-teal-800',
  viewing_outcome: 'bg-sky-100 text-sky-600',
  user_created: 'bg-emerald-100 text-emerald-600',
  user_updated: 'bg-teal-100 text-teal-800',
  business_account_created: 'bg-teal-100 text-teal-700',
  business_account_updated: 'bg-teal-100 text-teal-800',
  member_added: 'bg-emerald-100 text-emerald-600',
  member_removed: 'bg-red-100 text-red-600',
  contact_verified: 'bg-teal-100 text-teal-600',
  kyc_verified: 'bg-emerald-100 text-emerald-600',
  property_visited: 'bg-sky-100 text-sky-600',
  data_exported: 'bg-amber-100 text-amber-600',
};

const actionLabels: Partial<Record<AuditAction, string>> = {
  kyc_verified: 'Landlord verified',
};

function formatAction(action: AuditAction): string {
  if (actionLabels[action]) return actionLabels[action];
  return action
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getRelativeTime(date: Date): string {
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return date.toLocaleDateString();
}

export default async function ActivityPage() {
  const logs = await getRecentAuditLogs(50);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-6">
        <h1 className="text-lg lg:text-2xl font-medium text-gray-900">Activity Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A record of all significant actions across listings, leads, and users.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {logs.map((log) => {
                const action = log.action as AuditAction;
                const Icon = iconMap[action] ?? Settings;
                const colors = colorMap[action] ?? 'bg-gray-100 text-gray-600';

                return (
                  <li key={log.id} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
                    <div className={`mt-0.5 rounded-full p-2 shrink-0 ${colors}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {formatAction(action)}
                        {log.entityType && log.entityId && (
                          <span className="font-normal text-gray-500">
                            {' '}— {log.entityType} #{log.entityId}
                          </span>
                        )}
                      </p>
                      {log.userName && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          by {log.userName}
                          {log.userEmail && ` (${log.userEmail})`}
                        </p>
                      )}
                    </div>
                    <time className="text-xs text-gray-400 shrink-0 mt-0.5">
                      {getRelativeTime(new Date(log.createdAt))}
                    </time>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-12">
              <Clock className="h-12 w-12 text-gray-300 mb-4" />
              <h3 className="text-base font-semibold text-gray-900 mb-1">No activity yet</h3>
              <p className="text-sm text-gray-500 max-w-sm">
                Actions on listings, leads, and users will appear here as they happen.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
