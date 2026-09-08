import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import BackOfficeShell from './back-office-shell';

export const revalidate = 30;

export default async function BackOfficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireBackOfficeAccess();
  const flags = await loadFeatureFlags();

  return (
    <BackOfficeShell showImports={flags.enableFacebookImport}>
      {children}
    </BackOfficeShell>
  );
}
