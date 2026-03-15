'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2, Link2, Copy, ExternalLink } from 'lucide-react';
import { updateAccount } from '@/app/(login)/actions';
import { User } from '@/lib/db/schema';
import useSWR from 'swr';
import { Suspense } from 'react';
import { Shield } from 'lucide-react';
import Link from 'next/link';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type ActionState = {
  name?: string;
  error?: string;
  success?: string;
};

type AccountFormProps = {
  state: ActionState;
  nameValue?: string;
  emailValue?: string;
};

function AccountForm({
  state,
  nameValue = '',
  emailValue = ''
}: AccountFormProps) {
  return (
    <>
      <div>
        <Label htmlFor="name" className="mb-2">
          Name
        </Label>
        <Input
          id="name"
          name="name"
          placeholder="Enter your name"
          defaultValue={state.name || nameValue}
          required
        />
      </div>
      <div>
        <Label htmlFor="email" className="mb-2">
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="Enter your email"
          defaultValue={emailValue}
          required
        />
      </div>
    </>
  );
}

function AccountFormWithData({ state }: { state: ActionState }) {
  const { data: user } = useSWR<User>('/api/user', fetcher);
  return (
    <AccountForm
      state={state}
      nameValue={user?.name ?? ''}
      emailValue={user?.email ?? ''}
    />
  );
}

type ProfileSlugData = {
  profileUrl: string;
  profileSlug: string | null;
  publicId: string;
  canSetCustomSlug: boolean;
};

function ProfileUrlCard() {
  const { data, error, mutate } = useSWR<ProfileSlugData>(
    '/api/landlords/me/profile-slug',
    fetcher
  );
  const [slugInput, setSlugInput] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleClaim = async () => {
    if (!slugInput.trim()) return;
    setClaiming(true);
    setClaimError(null);
    setClaimSuccess(false);
    try {
      const res = await fetch('/api/landlords/me/profile-slug', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slugInput.trim().toLowerCase() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setClaimError(json.error ?? 'Failed to set custom URL');
        return;
      }
      setClaimSuccess(true);
      setSlugInput('');
      mutate();
    } catch {
      setClaimError('Something went wrong');
    } finally {
      setClaiming(false);
    }
  };

  const handleCopy = () => {
    if (data?.profileUrl) {
      navigator.clipboard.writeText(data.profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (error || !data || !data.profileUrl) return null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Profile URL
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600 mb-4">
          Your sharable landlord portfolio. Share this link to showcase your listings.
        </p>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <code className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-mono break-all">
            {data.profileUrl}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="shrink-0"
          >
            {copied ? (
              'Copied!'
            ) : (
              <>
                <Copy className="h-4 w-4 mr-1" />
                Copy
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" asChild className="shrink-0">
            <a href={data.profileUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-1" />
              Open
            </a>
          </Button>
        </div>

        {data.canSetCustomSlug ? (
          <div className="space-y-2">
            <Label htmlFor="profile-slug">Custom URL (one-time)</Label>
            <p className="text-xs text-gray-500 mb-2">
              Claim a custom URL like stayrental.lk/prime-lands. Letters, numbers, and hyphens only. 3–30 characters.
            </p>
            <div className="flex gap-2">
              <Input
                id="profile-slug"
                placeholder="e.g. prime-lands"
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value)}
                className="max-w-xs"
              />
              <Button
                onClick={handleClaim}
                disabled={claiming || !slugInput.trim()}
                className="bg-teal-800 hover:bg-teal-900 text-white"
              >
                {claiming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Claim'
                )}
              </Button>
            </div>
            {claimError && (
              <p className="text-red-500 text-sm">{claimError}</p>
            )}
            {claimSuccess && (
              <p className="text-green-500 text-sm">Custom URL set successfully!</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            Custom URLs are a Premium feature.{' '}
            <Link href="/list-your-property" className="text-teal-700 font-medium hover:underline">
              Upgrade to Premium
            </Link>{' '}
            to get a personalized profile link.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function GeneralPage() {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    updateAccount,
    {}
  );

  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium text-gray-900 mb-6">
        General Settings
      </h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" action={formAction}>
            <Suspense fallback={<AccountForm state={state} />}>
              <AccountFormWithData state={state} />
            </Suspense>
            {state.error && (
              <p className="text-red-500 text-sm">{state.error}</p>
            )}
            {state.success && (
              <p className="text-green-500 text-sm">{state.success}</p>
            )}
            <Button
              type="submit"
              className="bg-teal-800 hover:bg-teal-900 text-white"
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <ProfileUrlCard />

      <Card>
        <CardHeader>
          <CardTitle>Security & Privacy</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-4">
            Manage your password, security settings, and account deletion.
          </p>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/dashboard/security" className="flex items-center">
              <Shield className="mr-2 h-4 w-4" />
              Go to Security Settings
            </Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
