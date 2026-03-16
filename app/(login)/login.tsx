'use client';

import Link from 'next/link';
import { useActionState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CircleIcon, Loader2 } from 'lucide-react';
import { signIn, signUp } from './actions';
import { ActionState } from '@/lib/auth/middleware';
import { SignedUpBanner } from '@/components/signed-up-banner';

interface LoginProps {
  mode?: 'signin' | 'signup';
  redirect?: string;
  priceId?: string;
  inviteId?: string;
  plan?: string;
  signedUp?: boolean;
}

function LoginForm({ mode = 'signin', redirect = '', priceId = '', inviteId = '', plan = '', signedUp = false }: LoginProps) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    mode === 'signin' ? signIn : signUp,
    { error: '' }
  );

  return (
    <div className="min-h-[100dvh] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
      {signedUp && (
        <div className="sm:mx-auto sm:w-full sm:max-w-md mb-4">
          <SignedUpBanner show={true} />
        </div>
      )}
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <CircleIcon className="h-12 w-12 text-teal-700" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          {mode === 'signin' ? 'Sign in to your account' : 'Create your account'}
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <form className="space-y-6" action={formAction}>
          <input type="hidden" name="redirect" value={redirect} />
          <input type="hidden" name="priceId" value={priceId} />
          <input type="hidden" name="inviteId" value={inviteId} />
          <input type="hidden" name="plan" value={plan} />

          <div>
            <Label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </Label>
            <div className="mt-1">
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={state.email}
                required
                maxLength={50}
                className="appearance-none rounded-full relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-teal-600 focus:border-teal-600 focus:z-10 sm:text-sm"
                placeholder="Enter your email"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </Label>
            <div className="mt-1">
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                defaultValue={state.password}
                required
                minLength={8}
                maxLength={100}
                className="appearance-none rounded-full relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-teal-600 focus:border-teal-600 focus:z-10 sm:text-sm"
                placeholder="Enter your password"
              />
            </div>
            {mode === 'signin' && (
              <div className="mt-2 text-right">
                <Link
                  href="/forgot-password"
                  className="text-xs text-teal-700 hover:text-teal-800 hover:underline"
                >
                  Forgot your password?
                </Link>
              </div>
            )}
          </div>

          {state?.error && (
            <div className="text-red-500 text-sm">{state.error}</div>
          )}

          <div>
            <Button
              type="submit"
              className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-full shadow-sm text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-600 h-10"
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2 className="animate-spin mr-2 h-4 w-4" />
                  Loading...
                </>
              ) : mode === 'signin' ? (
                'Sign in'
              ) : (
                'Sign up'
              )}
            </Button>
          </div>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-50 text-gray-500">
                {mode === 'signin' ? 'New to our platform?' : 'Already have an account?'}
              </span>
            </div>
          </div>

          <div className="mt-6">
            <Link
              href={`${mode === 'signin' ? '/sign-up' : '/sign-in'}${
                redirect ? `?redirect=${redirect}` : ''
              }${priceId ? `&priceId=${priceId}` : ''}${plan ? `&plan=${plan}` : ''}`}
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-full shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-600"
            >
              {mode === 'signin' ? 'Create an account' : 'Sign in to existing account'}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// Reads search params and passes them as plain props — must be inside <Suspense>
function LoginWithSearchParams({ mode = 'signin' }: { mode?: 'signin' | 'signup' }) {
  const searchParams = useSearchParams();
  return (
    <LoginForm
      mode={mode}
      redirect={searchParams.get('redirect') ?? ''}
      priceId={searchParams.get('priceId') ?? ''}
      inviteId={searchParams.get('inviteId') ?? ''}
      plan={searchParams.get('plan') ?? ''}
      signedUp={searchParams.get('signed_up') === '1'}
    />
  );
}

// Simple loading skeleton — does NOT call useSearchParams
function LoginSkeleton() {
  return (
    <div className="min-h-[100dvh] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md space-y-4 animate-pulse">
        <div className="h-12 w-12 rounded-full bg-gray-200 mx-auto" />
        <div className="h-8 bg-gray-200 rounded-lg w-3/4 mx-auto" />
        <div className="h-10 bg-gray-200 rounded-full w-full mt-8" />
        <div className="h-10 bg-gray-200 rounded-full w-full" />
        <div className="h-10 bg-teal-200 rounded-full w-full" />
      </div>
    </div>
  );
}

// Public export — wraps the searchParams reader in Suspense with a safe fallback
export function Login({ mode = 'signin' }: { mode?: 'signin' | 'signup' }) {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginWithSearchParams mode={mode} />
    </Suspense>
  );
}
