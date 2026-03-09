'use server';

import { z } from 'zod';
import { and, eq, gte, sql, isNull } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '@/lib/db/drizzle';
import {
  User,
  users,
  passwordResetTokens,
  type NewUser,
} from '@/lib/db/schema';
import { comparePasswords, hashPassword, setSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getUser } from '@/lib/db/queries';
import {
  validatedAction,
  validatedActionWithUser
} from '@/lib/auth/middleware';
import { sendPasswordResetEmail } from '@/lib/email';

async function ensurePasswordResetTable() {
  try {
    // Quick existence check
    await db.execute(sql`SELECT 1 FROM "password_reset_tokens" LIMIT 1`);
  } catch (error: any) {
    const msg = error?.message || '';
    // 42P01 = undefined_table
    if (error?.code === '42P01' || msg.includes('password_reset_tokens')) {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
          "id" SERIAL PRIMARY KEY,
          "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "token_hash" TEXT NOT NULL UNIQUE,
          "expires_at" TIMESTAMP NOT NULL,
          "used_at" TIMESTAMP,
          "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
        );
      `);
      await db.execute(
        sql`CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON "password_reset_tokens"("user_id");`
      );
      await db.execute(
        sql`CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON "password_reset_tokens"("expires_at");`
      );
    } else {
      throw error;
    }
  }
}

const signInSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(8).max(100)
});

export const signIn = validatedAction(signInSchema, async (data) => {
  const { email, password } = data;

  const [foundUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!foundUser) {
    return {
      error: 'Invalid email or password. Please try again.',
      email,
      password
    };
  }

  const isPasswordValid = await comparePasswords(
    password,
    foundUser.passwordHash
  );

  if (!isPasswordValid) {
    return {
      error: 'Invalid email or password. Please try again.',
      email,
      password
    };
  }

  await setSession(foundUser);

  // Redirect based on user role
  if (foundUser.role === 'ops' || foundUser.role === 'admin') {
    redirect('/dashboard');
  } else {
    redirect('/listings');
  }
});

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['tenant', 'landlord']).optional()
});

export const signUp = validatedAction(signUpSchema, async (data) => {
  const { email, password, role = 'tenant' } = data;

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser.length > 0) {
    return {
      error: 'User with this email already exists. Please sign in instead.',
      email,
      password
    };
  }

  const passwordHash = await hashPassword(password);

  const newUser: NewUser = {
    email,
    passwordHash,
    role: role as 'tenant' | 'landlord'
  };

  const [createdUser] = await db.insert(users).values(newUser).returning();

  if (!createdUser) {
    return {
      error: 'Failed to create user. Please try again.',
      email,
      password
    };
  }

  await setSession(createdUser);

  // Redirect based on user role
  if (createdUser.role === 'landlord') {
    redirect('/dashboard');
  } else {
    redirect('/listings');
  }
});

const requestPasswordResetSchema = z.object({
  email: z.string().email().min(3).max(255),
});

export const requestPasswordReset = validatedAction(
  requestPasswordResetSchema,
  async (data) => {
    const { email } = data;

    // Always return a generic message to avoid email enumeration
    const genericResponse = {
      success:
        'If an account exists for this email, we\'ve sent a password reset link.',
      email,
    };

    // Best-effort: make sure table exists so we don't crash
    try {
      await ensurePasswordResetTable();
    } catch {
      return genericResponse;
    }

    const [foundUser] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    if (!foundUser) {
      return genericResponse;
    }

    // Invalidate existing tokens for this user
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, foundUser.id));

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 minutes

    await db.insert(passwordResetTokens).values({
      userId: foundUser.id,
      tokenHash,
      expiresAt,
    });

    // Fire-and-forget email; errors are logged inside sendEmail
    sendPasswordResetEmail(
      foundUser.email,
      foundUser.name || foundUser.email,
      token,
    ).catch(() => {});

    return genericResponse;
  }
);

const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(8).max(100),
  confirmPassword: z.string().min(8).max(100),
});

export const resetPassword = validatedAction(
  resetPasswordSchema,
  async (data) => {
    const { token, newPassword, confirmPassword } = data;

    if (newPassword !== confirmPassword) {
      return {
        token,
        newPassword,
        confirmPassword,
        error: 'New password and confirmation do not match.',
      };
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const now = new Date();

    try {
      await ensurePasswordResetTable();
    } catch {
      return {
        token: '',
        newPassword,
        confirmPassword,
        error:
          'This reset link is invalid or has expired. Please request a new one.',
      };
    }

    const [resetRecord] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gte(passwordResetTokens.expiresAt, now),
        )
      )
      .limit(1);

    if (!resetRecord) {
      return {
        token: '',
        newPassword,
        confirmPassword,
        error: 'This reset link is invalid or has expired. Please request a new one.',
      };
    }

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, resetRecord.userId), isNull(users.deletedAt)))
      .limit(1);

    if (!user) {
      return {
        token: '',
        newPassword,
        confirmPassword,
        error: 'This reset link is invalid or has expired. Please request a new one.',
      };
    }

    const newPasswordHash = await hashPassword(newPassword);

    await db
      .update(users)
      .set({ passwordHash: newPasswordHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, resetRecord.id));

    return {
      success: 'Your password has been reset. You can now sign in with your new password.',
    };
  }
);

export async function signOut() {
  (await cookies()).delete('session');
}

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(100),
  newPassword: z.string().min(8).max(100),
  confirmPassword: z.string().min(8).max(100)
});

export const updatePassword = validatedActionWithUser(
  updatePasswordSchema,
  async (data, _, user) => {
    const { currentPassword, newPassword, confirmPassword } = data;

    const isPasswordValid = await comparePasswords(
      currentPassword,
      user.passwordHash
    );

    if (!isPasswordValid) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'Current password is incorrect.'
      };
    }

    if (currentPassword === newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'New password must be different from the current password.'
      };
    }

    if (confirmPassword !== newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'New password and confirmation password do not match.'
      };
    }

    const newPasswordHash = await hashPassword(newPassword);

    await db
      .update(users)
      .set({ passwordHash: newPasswordHash })
      .where(eq(users.id, user.id));

    return {
      success: 'Password updated successfully.'
    };
  }
);

const deleteAccountSchema = z.object({
  password: z.string().min(8).max(100)
});

export const deleteAccount = validatedActionWithUser(
  deleteAccountSchema,
  async (data, _, user) => {
    const { password } = data;

    const isPasswordValid = await comparePasswords(password, user.passwordHash);
    if (!isPasswordValid) {
      return {
        password,
        error: 'Incorrect password. Please try again.'
      };
    }

    try {
      // Generate unique email suffix
      const timestamp = Date.now();
      let uniqueEmail = `${user.email}-${user.id}-deleted-${timestamp}`;
      
      // If email is too long, truncate it
      if (uniqueEmail.length > 255) {
        const maxLength = 255;
        const suffix = `-${user.id}-deleted-${timestamp}`;
        const emailPrefix = user.email.substring(0, maxLength - suffix.length);
        uniqueEmail = `${emailPrefix}${suffix}`;
      }

      // Soft delete
      await db
        .update(users)
        .set({
          deletedAt: new Date(),
          email: uniqueEmail
        })
        .where(eq(users.id, user.id));

      // Delete session cookie
      (await cookies()).delete('session');
    } catch (error: any) {
      console.error('Error deleting account:', error);
      
      // Check for specific database errors
      let errorMessage = 'Failed to delete account. Please try again or contact support.';
      
      if (error.code === '23505') { // Unique constraint violation
        errorMessage = 'An error occurred while updating your account. Please contact support.';
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }
      
      return {
        password: '',
        error: errorMessage
      };
    }

    // Redirect after successful deletion (outside try-catch so redirect error is not caught)
    redirect('/sign-in?deleted=true');
  }
);

const updateAccountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address')
});

export const updateAccount = validatedActionWithUser(
  updateAccountSchema,
  async (data, _, user) => {
    const { name, email } = data;

    await db.update(users).set({ name, email }).where(eq(users.id, user.id));

    return { name, success: 'Account updated successfully.' };
  }
);

