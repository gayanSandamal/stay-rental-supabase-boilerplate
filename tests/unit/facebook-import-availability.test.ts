import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getBackOfficeNavItems } from '@/app/(dashboard)/back-office/back-office-shell';

type StaffRole = 'ops' | 'admin';
type ImportRoute = 'list' | 'new' | 'existing-review';

interface AvailabilityScenario {
  role: StaffRole;
  enableFacebookImport: boolean;
  notifyImportedOwners: boolean;
  route: ImportRoute;
  migration0057Applied: boolean;
  schemaDriftPassed: boolean;
}

interface ObservedAvailability {
  importsLinkVisible: boolean;
  requestedWorkflowRendered: boolean;
  genericPageNotFound: boolean;
  trafficPromoted: boolean;
}

const ROOT = process.cwd();
const layoutPath = join(ROOT, 'app/(dashboard)/back-office/layout.tsx');
const shellPath = join(ROOT, 'app/(dashboard)/back-office/back-office-shell.tsx');
const actionsPath = join(ROOT, 'app/(dashboard)/back-office/imports/actions.ts');
const runnerPath = join(ROOT, 'lib/db/run-all-migrations.ts');
const migrationPath = join(ROOT, 'lib/db/migrations/0057_facebook_imports.sql');

const routePaths: Record<ImportRoute, string> = {
  list: join(ROOT, 'app/(dashboard)/back-office/imports/page.tsx'),
  new: join(ROOT, 'app/(dashboard)/back-office/imports/new/page.tsx'),
  'existing-review': join(ROOT, 'app/(dashboard)/back-office/imports/[id]/page.tsx'),
};

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function hasFeatureAwareNavigation(): boolean {
  if (!existsSync(shellPath)) return false;
  const layout = read(layoutPath);
  const shell = read(shellPath);
  return (
    /showImports=\{flags\.enableFacebookImport\}/.test(layout) &&
    /showImports\s*\?/.test(shell) &&
    shell.includes("href: '/back-office/imports'")
  );
}

function observeImportsLink(enableFacebookImport: boolean): boolean {
  if (hasFeatureAwareNavigation()) return enableFacebookImport;

  // Baseline observation: the original client layout owns one static list and
  // advertises Imports regardless of the private server-side master flag.
  return read(layoutPath).includes("href: '/back-office/imports'");
}

function routeContractExists(route: ImportRoute): boolean {
  const source = read(routePaths[route]);
  const authorization = source.indexOf('requireBackOfficeAccess()');
  const snapshot = source.indexOf('loadFeatureFlags()');
  const concealment = source.indexOf('notFound()');
  const marker =
    route === 'list'
      ? 'title="Imports"'
      : route === 'new'
        ? 'title="Import a post"'
        : '<ReviewForm';

  return (
    authorization >= 0 &&
    snapshot > authorization &&
    concealment > snapshot &&
    source.includes(marker)
  );
}

function observeScenario(input: AvailabilityScenario): ObservedAvailability {
  const routeAvailable =
    input.enableFacebookImport &&
    input.migration0057Applied &&
    routeContractExists(input.route);

  return {
    importsLinkVisible: observeImportsLink(input.enableFacebookImport),
    requestedWorkflowRendered: routeAvailable,
    genericPageNotFound: !routeAvailable,
    trafficPromoted: input.migration0057Applied && input.schemaDriftPassed,
  };
}

function expectedBehavior(input: AvailabilityScenario): ObservedAvailability {
  const routeAvailable = input.enableFacebookImport && input.migration0057Applied;
  return {
    importsLinkVisible: input.enableFacebookImport,
    requestedWorkflowRendered: routeAvailable,
    genericPageNotFound: !routeAvailable,
    trafficPromoted: input.migration0057Applied && input.schemaDriftPassed,
  };
}

function scenarios(): AvailabilityScenario[] {
  const roles: StaffRole[] = ['ops', 'admin'];
  const booleans = [false, true];
  const routes: ImportRoute[] = ['list', 'new', 'existing-review'];

  return roles.flatMap((role) =>
    booleans.flatMap((enableFacebookImport) =>
      routes.flatMap((route) =>
        booleans.flatMap((notifyImportedOwners) =>
          booleans.flatMap((migration0057Applied) =>
            booleans.map((schemaDriftPassed) => ({
              role,
              enableFacebookImport,
              notifyImportedOwners,
              route,
              migration0057Applied,
              schemaDriftPassed,
            }))
          )
        )
      )
    )
  );
}

interface ExportedFunction {
  name: string;
  body: string;
}

function exportedAsyncFunctions(source: string): ExportedFunction[] {
  const functions: ExportedFunction[] = [];
  const declaration = /export\s+async\s+function\s+(\w+)\s*\([^]*?\)\s*(?::\s*[^\{]+)?\{/g;

  for (const match of source.matchAll(declaration)) {
    const name = match[1];
    const open = (match.index ?? 0) + match[0].lastIndexOf('{');
    let depth = 0;
    let close = source.length;
    for (let index = open; index < source.length; index += 1) {
      if (source[index] === '{') depth += 1;
      if (source[index] === '}') depth -= 1;
      if (depth === 0) {
        close = index + 1;
        break;
      }
    }
    functions.push({ name, body: source.slice(open, close) });
  }

  return functions;
}

describe('Property 1: Facebook Import Availability and Safe Promotion', () => {
  /** **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6** */
  it('matches navigation, route, notification-independence, and release behavior for the generated matrix', () => {
    const counterexamples = scenarios()
      .map((input) => ({ input, actual: observeScenario(input), expected: expectedBehavior(input) }))
      .filter(({ actual, expected }) => JSON.stringify(actual) !== JSON.stringify(expected));

    expect(
      counterexamples,
      counterexamples.length
        ? `Smallest counterexample: ${JSON.stringify(counterexamples[0])}`
        : undefined
    ).toEqual([]);
  });

  /** **Validates: Requirements 3.2, 3.4, 3.6** */
  it('keeps every remotely callable importer export behind the staff and master-flag guard', () => {
    const unguarded = exportedAsyncFunctions(read(actionsPath))
      .filter(({ body }) => !body.includes('requireStaff('))
      .map(({ name }) => name);

    expect(
      unguarded,
      unguarded.length
        ? `Callable-export counterexample: ${unguarded.join(', ')} can reach importer data without requireStaff()`
        : undefined
    ).toEqual([]);
  });

  it('registers migration 0057 with its importer and WhatsApp verification prerequisites', () => {
    const runner = read(runnerPath);
    const migration = read(migrationPath);

    expect(runner).toContain("'0057_facebook_imports.sql'");
    expect(migration).toContain('post_imports');
    expect(migration).toContain('wa_phone_verified_at');
    expect(migration).toContain('post_import_created');
  });
});

describe('Facebook import fixed boundaries', () => {
  /** **Validates: Requirements 2.3, 3.9** */
  it('changes only the Imports navigation entry when the master flag changes', () => {
    const withoutImports = getBackOfficeNavItems(false).map(({ href, label }) => ({ href, label }));
    const withImports = getBackOfficeNavItems(true).map(({ href, label }) => ({ href, label }));

    expect(withoutImports.some(({ href }) => href === '/back-office/imports')).toBe(false);
    expect(withImports.filter(({ href }) => href === '/back-office/imports')).toEqual([
      { href: '/back-office/imports', label: 'Imports' },
    ]);
    expect(withImports.filter(({ href }) => href !== '/back-office/imports')).toEqual(withoutImports);
    expect(withImports[6]).toEqual({ href: '/back-office/imports', label: 'Imports' });
  });

  /** **Validates: Requirements 2.3, 2.5, 3.3, 3.4, 3.8** */
  it('authorizes the server layout before deriving one private boolean from its returned snapshot', () => {
    const layout = read(layoutPath);
    const authorization = layout.indexOf('requireBackOfficeAccess()');
    const snapshot = layout.indexOf('const flags = await loadFeatureFlags()');

    expect(authorization).toBeGreaterThanOrEqual(0);
    expect(snapshot).toBeGreaterThan(authorization);
    expect(layout).toContain('showImports={flags.enableFacebookImport}');
    expect(layout).toContain('export const revalidate = 30');
    expect(layout).not.toContain("dynamic = 'force-dynamic'");
    expect(layout).not.toContain('notifyImportedOwners');
  });

  /** **Validates: Requirements 2.1, 2.2, 3.1, 3.7, 3.8** */
  it('uses each importer page returned snapshot directly before importer reads', () => {
    for (const path of Object.values(routePaths)) {
      const source = read(path);
      expect(source).toContain('const flags = await loadFeatureFlags()');
      expect(source).toContain('if (!flags.enableFacebookImport) notFound()');
      expect(source).not.toContain("isFeatureEnabled('enableFacebookImport')");
      expect(source).toContain('export const revalidate = 30');
      expect(source).not.toContain("dynamic = 'force-dynamic'");
    }
  });

  /** **Validates: Requirements 2.4, 2.6** */
  it('documents migration 0057 and zero-drift as traffic-promotion gates on the same target', () => {
    const runbook = read(join(ROOT, 'docs/whatsapp-golive-runbook.md'));
    const migrate = runbook.indexOf(
      'DATABASE_URL=<target-transaction-pooler-url> pnpm db:migrate-all'
    );
    const drift = runbook.indexOf(
      'DATABASE_URL=<target-transaction-pooler-url> pnpm db:check-drift'
    );
    const promotion = runbook.indexOf(
      'Only after migration 0057 and drift both pass may the deployment receive'
    );

    expect(runbook).toContain('lib/db/migrations/0057_facebook_imports.sql');
    expect(runbook).toContain('post_imports');
    expect(runbook).toContain('users.wa_phone_verified_at');
    expect(migrate).toBeGreaterThanOrEqual(0);
    expect(drift).toBeGreaterThan(migrate);
    expect(promotion).toBeGreaterThan(drift);
    expect(runbook).toContain('`notifyImportedOwners` OFF');
  });
});
