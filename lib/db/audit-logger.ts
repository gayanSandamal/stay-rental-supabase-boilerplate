import { db } from './drizzle';
import { auditLogs, type NewAuditLog } from './schema';
import { isFeatureEnabled } from '@/lib/feature-flags';

type AuditAction = NewAuditLog['action'];

interface LogAuditParams {
  action: AuditAction;
  entityType: string;
  entityId?: number;
  userId?: number;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

export async function logAudit(params: LogAuditParams): Promise<void> {
  if (!isFeatureEnabled('enableAuditLog')) return;

  try {
    await db.insert(auditLogs).values({
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      userId: params.userId ?? null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      ipAddress: params.ipAddress ?? null,
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}

export async function logListingAction(
  action: AuditAction,
  listingId: number,
  userId: number,
  metadata?: Record<string, unknown>,
  ipAddress?: string
) {
  return logAudit({
    action,
    entityType: 'listing',
    entityId: listingId,
    userId,
    metadata,
    ipAddress,
  });
}

