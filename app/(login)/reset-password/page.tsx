'use client';

import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CircleIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resetPassword } from '../actions';
import type { ActionState } from '@/lib/auth/middleware';

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    resetPassword,
    { error: '', success: '' }
  );

  const effectiveToken = state.token || tokenFromUrl;

  if (!effectiveToken) {
    return (
      <div className="min-h-[100dvh] flex flex-col justify-center items-center bg-gray-50 px-4">
        <div className="sm:max-w-md w-full text-center">
          <CircleIcon className="h-12 w-12 text-orange-500 mx-auto" />
          <h2 className="mt-4 text-2xl font-bold text-gray-900">
            Invalid reset link
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            This password reset link is missing or invalid. Please request a new link.
          </p>
          <div className="mt-6">
            <Link
              href="/forgot-password"
              className="text-orange-600 hover:text-orange-700 hover:underline text-sm"
            >
              Request a new reset link
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const showSuccess = !!state.success && !state.error;

  return (
    <div className="min-h-[100dvh] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <CircleIcon className="h-12 w-12 text-orange-500" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Choose a new password
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Your new password must be at least 8 characters long.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <form className="space-y-6" action={formAction}>
          <input type="hidden" name="token" value={effectiveToken} />

          <div>
            <Label
              htmlFor="newPassword"
              className="block text-sm font-medium text-gray-700"
            >
              New password
            </Label>
            <div className="mt-1">
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={100}
                className="appearance-none rounded-full relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-orange-500 focus:border-orange-500 focus:z-10 sm:text-sm"
                placeholder="Enter a new password"
              />
            </div>
          </div>

          <div>
            <Label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-gray-700"
            >
              Confirm new password
            </Label>
            <div className="mt-1">
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={100}
                className="appearance-none rounded-full relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-orange-500 focus:border-orange-500 focus:z-10 sm:text-sm"
                placeholder="Re-enter your new password"
              />
            </div>
          </div>

          {state?.error && (
            <div className="text-red-500 text-sm">{state.error}</div>
          )}
          {showSuccess && (
            <div className="text-green-600 text-sm">{state.success}</div>
          )}

          <div>
            <Button
              type="submit"
              className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-full shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 h-10"
              disabled={pending || showSuccess}
            >
              {pending ? (
                <>
                  <Loader2 className="animate-spin mr-2 h-4 w-4" />
                  Updating password...
                </>
              ) : (
                'Update password'
              )}
            </Button>
          </div>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600">
          <Link
            href="/sign-in"
            className="text-orange-600 hover:text-orange-700 hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

