import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { Terminal } from '../terminal';

export const metadata = {
  title: 'Terminal | Easy Rent',
  description: 'Developer setup instructions for Easy Rent.',
};

export default async function TerminalPage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Quick Start</h1>
        <p className="text-slate-600 text-sm mb-8">
          Developer-oriented setup instructions for the Easy Rent codebase.
        </p>
        <Terminal />
      </div>
    </main>
  );
}
