import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import { getResolvedFeatureFlags } from '@/lib/feature-flags';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { FeatureFlagsManager } from './feature-flags-manager';

export const dynamic = 'force-dynamic';

export default async function BackOfficeSettingsPage() {
  const user = await requireBackOfficeAccess();
  await loadFeatureFlags(true);
  const flags = getResolvedFeatureFlags();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Back Office Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Feature Flags</CardTitle>
          <CardDescription>
            Toggle platform-wide features. Changes are saved immediately and apply across the app
            within ~30 seconds. The pricing/visibility switch also hides all price copy and upgrade CTAs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FeatureFlagsManager flags={flags} canEdit={user.role === 'admin'} />
        </CardContent>
      </Card>
    </div>
  );
}
