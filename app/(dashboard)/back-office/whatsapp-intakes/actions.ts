'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { validatedActionWithUser } from '@/lib/auth/middleware';
import { db } from '@/lib/db/drizzle';
import { whatsappIntakes } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logAudit } from '@/lib/db/audit-logger';

const intakeActionSchema = z.object({
  intakeId: z.coerce.number().int().positive(),
  action: z.enum(['reject', 'retry']),
});

/**
 * Ops actions on an intake: reject it, or push it back to `received` so the
 * next cron run reprocesses it (e.g. after the sender added info, or a
 * transient parser failure).
 */
export const updateIntake = validatedActionWithUser(
  intakeActionSchema,
  async (data, _formData, user) => {
    if (user.role !== 'admin' && user.role !== 'ops') {
      return { error: 'Only admin or ops can manage intakes.' };
    }

    const status = data.action === 'reject' ? 'rejected' : 'received';
    await db
      .update(whatsappIntakes)
      .set({ status, failureReason: null, updatedAt: new Date() })
      .where(eq(whatsappIntakes.id, data.intakeId));

    await logAudit({
      action: 'whatsapp_intake_updated',
      entityType: 'whatsapp_intake',
      entityId: data.intakeId,
      userId: user.id,
      metadata: { action: data.action },
    });

    revalidatePath('/back-office/whatsapp-intakes');
    return { success: `Intake ${data.action === 'reject' ? 'rejected' : 'queued for reprocessing'}.` };
  }
);
