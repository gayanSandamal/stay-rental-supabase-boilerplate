'use server';

import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { users, type NewUser } from '@/lib/db/schema';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/db/queries';
import {
  validatedAction,
  validatedActionWithUser
} from '@/lib/auth/middleware';
import { addContactToResend } from '@/lib/email';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://easyrent.lk';
const AUTH_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]);
}

const signInSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(8).max(100)
});

export const signIn = validatedAction(signInSchema, async (data, formData) => {
  const { email, password } = data;

  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    console.error('[signIn] createClient failed:', err);
    return {
      error: 'Authentication service is not configured. Please contact support.',
      email,
      password
    };
  }

  let authData: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['data'];
  let authError: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['error'];

  try {
    const result = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      AUTH_TIMEOUT_MS,
      'Sign in is taking too long. Please check your connection and try again.'
    );
    authData = result.data;
    authError = result.error;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[signIn] Supabase signInWithPassword failed:', err);
    return {
      error: msg.includes('too long') ? msg : 'Sign in failed. Please try again.',
      email,
      password
    };
  }

  if (authError) {
    return {
      error: 'Invalid email or password. Please try again.',
      email,
      password
    };
  }

  const authUser = authData.user;
  if (!authUser) {
    return {
      error: 'Invalid email or password. Please try again.',
      email,
      password
    };
  }

  // Load app user for role-based redirect
  const [foundUser] = await db
    .select()
    .from(users)
    .where(
      and(eq(users.authUserId, authUser.id), isNull(users.deletedAt))
    )
    .limit(1);

  if (foundUser) {
    addContactToResend(
      foundUser.email,
      foundUser.name,
      foundUser.role,
      foundUser.subscriptionTier || 'free',
    ).catch(() => {});
  }

  const redirectTo = formData.get('redirect') as string | null;
  if (redirectTo && redirectTo.startsWith('/')) {
    redirect(redirectTo);
  } else if (foundUser?.role === 'ops' || foundUser?.role === 'admin') {
    redirect('/dashboard');
  } else if (foundUser?.role === 'landlord') {
    redirect('/dashboard');
  } else {
    redirect('/listings');
  }
});

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['tenant', 'landlord']).optional(),
  plan: z.string().optional(),
});

export const signUp = validatedAction(signUpSchema, async (data, formData) => {
  const { email, password, role = 'tenant', plan } = data;

  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    console.error('[signUp] createClient failed:', err);
    return {
      error: 'Authentication service is not configured. Please contact support.',
      email,
      password
    };
  }

  let authData: Awaited<ReturnType<typeof supabase.auth.signUp>>['data'];
  let authError: Awaited<ReturnType<typeof supabase.auth.signUp>>['error'];

  try {
    const result = await withTimeout(
      supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${process.env.NEXT_PUBLIC_BASE_URL ?? baseUrl}/auth/callback?next=/listings`
        }
      }),
      AUTH_TIMEOUT_MS,
      'Sign up is taking too long. Please check your connection and try again.'
    );
    authData = result.data;
    authError = result.error;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[signUp] Supabase signUp failed:', err);
    return {
      error: msg.includes('too long') ? msg : 'Sign up failed. Please try again.',
      email,
      password
    };
  }

  if (authError) {
    if (authError.message?.toLowerCase().includes('already registered')) {
      return {
        error: 'User with this email already exists. Please sign in instead.',
        email,
        password
      };
    }
    return {
      error: authError.message || 'Failed to create account. Please try again.',
      email,
      password
    };
  }

  const authUser = authData.user;
  if (!authUser) {
    return {
      error: 'Failed to create user. Please try again.',
      email,
      password
    };
  }

  const newUser: NewUser = {
    email,
    authUserId: authUser.id,
    role: role as 'tenant' | 'landlord',
    subscriptionTier: plan === 'premium' ? 'premium' : 'free',
  };

  const [createdUser] = await db.insert(users).values(newUser).returning();

  if (!createdUser) {
    return {
      error: 'Failed to create user. Please try again.',
      email,
      password
    };
  }

  addContactToResend(
    createdUser.email,
    createdUser.name,
    createdUser.role,
    createdUser.subscriptionTier || 'free',
  ).catch(() => {});

  const redirectTo = formData.get('redirect') as string | null;
  if (redirectTo && redirectTo.startsWith('/')) {
    redirect(redirectTo);
  } else if (createdUser.role === 'landlord') {
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

    const genericResponse = {
      success:
        'If an account exists for this email, we\'ve sent a password reset link.',
      email,
    };

    const [foundUser] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    if (!foundUser) {
      return genericResponse;
    }

    // Only users with auth_user_id (Supabase Auth) can use Supabase reset
    if (!foundUser.authUserId) {
      return genericResponse;
    }

    const supabase = await createClient();

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${baseUrl}/auth/callback?next=/reset-password`,
    });

    return genericResponse;
  }
);

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(100),
  confirmPassword: z.string().min(8).max(100),
});

export const resetPassword = validatedAction(
  resetPasswordSchema,
  async (data) => {
    const { newPassword, confirmPassword } = data;

    if (newPassword !== confirmPassword) {
      return {
        newPassword,
        confirmPassword,
        error: 'New password and confirmation do not match.',
      };
    }

    const supabase = await createClient();

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      return {
        newPassword,
        confirmPassword,
        error:
          'This reset link is invalid or has expired. Please request a new one.',
      };
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      return {
        newPassword,
        confirmPassword,
        error: error.message || 'Failed to update password. Please try again.',
      };
    }

    return {
      success: 'Your password has been reset. You can now sign in with your new password.',
    };
  }
);

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
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

    const supabase = await createClient();

    if (user.authUserId) {
      // Supabase Auth user: verify via sign-in, then update
      const { error: signInError } =
        await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });

      if (signInError) {
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

      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        return {
          currentPassword,
          newPassword,
          confirmPassword,
          error: error.message || 'Failed to update password.'
        };
      }

      return { success: 'Password updated successfully.' };
    }

    // Legacy user with password_hash (no auth_user_id)
    if (!user.passwordHash) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'Please use the password reset flow to set a new password.'
      };
    }

    const { comparePasswords, hashPassword } = await import('@/lib/auth/session');
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
      .set({ passwordHash: newPasswordHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    return { success: 'Password updated successfully.' };
  }
);

const deleteAccountSchema = z.object({
  password: z.string().min(8).max(100)
});

export const deleteAccount = validatedActionWithUser(
  deleteAccountSchema,
  async (data, _, user) => {
    const { password } = data;

    const supabase = await createClient();

    if (user.authUserId) {
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });

      if (error) {
        return {
          password,
          error: 'Incorrect password. Please try again.'
        };
      }
    } else if (user.passwordHash) {
      const { comparePasswords } = await import('@/lib/auth/session');
      const isPasswordValid = await comparePasswords(password, user.passwordHash);
      if (!isPasswordValid) {
        return {
          password,
          error: 'Incorrect password. Please try again.'
        };
      }
    } else {
      return {
        password,
        error: 'Incorrect password. Please try again.'
      };
    }

    try {
      const timestamp = Date.now();
      let uniqueEmail = `${user.email}-${user.id}-deleted-${timestamp}`;

      if (uniqueEmail.length > 255) {
        const suffix = `-${user.id}-deleted-${timestamp}`;
        const emailPrefix = user.email.substring(0, 255 - suffix.length);
        uniqueEmail = `${emailPrefix}${suffix}`;
      }

      await db
        .update(users)
        .set({
          deletedAt: new Date(),
          email: uniqueEmail
        })
        .where(eq(users.id, user.id));

      await supabase.auth.signOut();
    } catch (error: any) {
      console.error('Error deleting account:', error);

      let errorMessage = 'Failed to delete account. Please try again or contact support.';

      if (error.code === '23505') {
        errorMessage = 'An error occurred while updating your account. Please contact support.';
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }

      return {
        password: '',
        error: errorMessage
      };
    }

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

    const supabase = await createClient();

    if (user.authUserId) {
      const { error } = await supabase.auth.updateUser({ email });
      if (error) {
        return { name, email: user.email, error: error.message };
      }
    }

    await db.update(users).set({ name, email, updatedAt: new Date() }).where(eq(users.id, user.id));

    return { name, success: 'Account updated successfully.' };
  }
);
