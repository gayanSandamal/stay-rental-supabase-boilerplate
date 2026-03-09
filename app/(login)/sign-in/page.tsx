'use client';

import { Suspense } from 'react';
import { Login } from '../login';
import { useSearchParams } from 'next/navigation';

function DeletedMessage() {
  const searchParams = useSearchParams();
  const deleted = searchParams.get('deleted');

  if (deleted !== 'true') return null;

  return (
    <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-4">
      <p className="text-sm text-green-800">
        Your account has been successfully deleted.
      </p>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<Login mode="signin" />}>
      <DeletedMessage />
      <Login mode="signin" />
    </Suspense>
  );
}
