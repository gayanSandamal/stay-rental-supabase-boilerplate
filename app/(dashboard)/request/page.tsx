import { notFound } from 'next/navigation';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { RequestForm } from './request-form';

export const revalidate = 30;

/**
 * "Can't find what you're looking for?" — the public half of broker lead
 * routing (FORGE.md Concept 3). No nav entry yet; reachable at /request.
 * 404s rather than showing an explainer, unlike the dashboard pages, because
 * this one has no signed-in user to explain anything to.
 */
export default async function RequestPage() {
  await loadFeatureFlags();
  if (!isFeatureEnabled('enableLeadRouting')) notFound();

  return (
    <div className="max-w-xl mx-auto py-12 px-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Tell brokers what you're looking for
      </h1>
      <p className="text-gray-600 text-sm mb-6">
        Post your requirement once and any broker on Easy Rent can see it and reach out —
        free, and Easy Rent never takes a commission.
      </p>
      <RequestForm />
    </div>
  );
}
