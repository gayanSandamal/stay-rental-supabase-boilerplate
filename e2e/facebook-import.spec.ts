import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { creds, login, type SeedRole } from './helpers/auth';

type FlagSnapshot = { enableFacebookImport?: boolean };

const existingImportId = process.env.FACEBOOK_IMPORT_EXISTING_ID;
const controlledEnvironment =
  process.env.FACEBOOK_IMPORT_E2E === '1' &&
  process.env.MIGRATION_0057_CONFIRMED === '1' &&
  Boolean(existingImportId) &&
  Boolean(process.env.TARGET_ENVIRONMENT_IDENTITY) &&
  Boolean(process.env.DEPLOYMENT_IDENTIFIER);

async function effectiveFlags(page: Page): Promise<FlagSnapshot> {
  return page.evaluate(async () => {
    const response = await fetch('/api/back-office/feature-flags');
    if (!response.ok) throw new Error(`Feature flag probe failed with ${response.status}`);
    const body = (await response.json()) as { flags?: FlagSnapshot };
    return body.flags ?? {};
  });
}

async function attachProbeEvidence(
  testInfo: TestInfo,
  evidence: Record<string, unknown>
): Promise<void> {
  await testInfo.attach('facebook-import-probe.json', {
    body: Buffer.from(JSON.stringify(evidence, null, 2)),
    contentType: 'application/json',
  });
}

for (const role of ['ops', 'admin'] as const satisfies readonly SeedRole[]) {
  test.describe(`${role} Facebook import route probes`, () => {
    const staff = creds(role);

    test.skip(
      !controlledEnvironment || !staff,
      'Requires role credentials, a migrated controlled target, an existing import ID, and deployment/environment identity metadata'
    );

    test(`renders list, create, and existing review workflows with the effective master flag enabled`, async ({ page }, testInfo) => {
      await login(page, staff!.email, staff!.password);
      const flags = await effectiveFlags(page);
      expect(flags.enableFacebookImport, 'Controlled probe requires the effective master flag to be true').toBe(true);

      const probes = [
        { path: '/back-office/imports', marker: /imports/i },
        { path: '/back-office/imports/new', marker: /import a post/i },
        { path: `/back-office/imports/${existingImportId}`, marker: /original post/i },
      ];
      const results: Array<Record<string, unknown>> = [];

      for (const probe of probes) {
        const startedAt = new Date().toISOString();
        const response = await page.goto(probe.path);
        await expect(page.getByText(/page not found/i)).toHaveCount(0);
        await expect(page.getByText(probe.marker).first()).toBeVisible();
        results.push({
          requestedUrl: probe.path,
          finalUrl: page.url(),
          status: response?.status() ?? null,
          startedAt,
        });
      }

      await attachProbeEvidence(testInfo, {
        role,
        effectiveEnableFacebookImport: flags.enableFacebookImport,
        targetEnvironment: process.env.TARGET_ENVIRONMENT_IDENTITY,
        deploymentIdentifier: process.env.DEPLOYMENT_IDENTIFIER,
        databaseIdentity: process.env.DATABASE_IDENTITY ?? 'not-provided',
        recordId: Number(existingImportId),
        results,
        interpretation:
          'All workflows rendering rules out route declaration and middleware as the cause; investigate effective override, environment, deployment, snapshot age, or record identity for production-only failures.',
      });
    });
  });
}

test.describe('Facebook import flag snapshot convergence probe', () => {
  const admin = creds('admin');
  const canMutate =
    controlledEnvironment &&
    Boolean(admin) &&
    process.env.ALLOW_MUTATION === '1' &&
    process.env.FACEBOOK_IMPORT_CONVERGENCE === '1';

  test.skip(
    !canMutate,
    'Requires explicit controlled-environment mutation approval and admin credentials'
  );

  test('records local refresh and post-TTL convergence without force-dynamic rendering', async ({ page, browser }, testInfo) => {
    test.setTimeout(120_000);
    await login(page, admin!.email, admin!.password);
    const original = Boolean((await effectiveFlags(page)).enableFacebookImport);
    const observations: Array<Record<string, unknown>> = [];

    const setMasterFlag = async (value: boolean) => {
      const result = await page.evaluate(async (nextValue) => {
        const response = await fetch('/api/back-office/feature-flags', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ flag: 'enableFacebookImport', value: nextValue }),
        });
        return { ok: response.ok, status: response.status, body: await response.json() };
      }, value);
      expect(result.ok, JSON.stringify(result.body)).toBe(true);
    };

    try {
      await setMasterFlag(false);
      await setMasterFlag(true);
      observations.push({
        probe: 'updating-instance-immediate',
        timestamp: new Date().toISOString(),
        flags: await effectiveFlags(page),
      });

      await page.waitForTimeout(31_000);
      const secondContext = await browser.newContext();
      const secondPage = await secondContext.newPage();
      await login(secondPage, admin!.email, admin!.password);
      observations.push({
        probe: 'subsequent-request-after-ttl',
        timestamp: new Date().toISOString(),
        flags: await effectiveFlags(secondPage),
      });
      await secondContext.close();

      expect(observations.every(({ flags }) => (flags as FlagSnapshot).enableFacebookImport === true)).toBe(true);
    } finally {
      await setMasterFlag(original);
    }

    await attachProbeEvidence(testInfo, {
      targetEnvironment: process.env.TARGET_ENVIRONMENT_IDENTITY,
      deploymentIdentifier: process.env.DEPLOYMENT_IDENTIFIER,
      originalValue: original,
      cacheWindowSeconds: 30,
      observations,
    });
  });
});
