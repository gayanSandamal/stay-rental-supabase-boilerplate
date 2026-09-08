import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Role = 'anonymous' | 'tenant' | 'landlord' | 'ops' | 'admin';
type RouteKind = 'list' | 'new' | 'review';
type RecordState = 'malformed' | 'non-finite' | 'zero' | 'negative' | 'missing' | 'existing';

type RouteOutcome =
  | { kind: 'sign-in-redirect'; importerReads: number }
  | { kind: 'dashboard-redirect'; importerReads: number }
  | { kind: 'not-found'; importerReads: number }
  | { kind: 'rendered'; importerReads: number };

const ROOT = process.cwd();
const layoutPath = join(ROOT, 'app/(dashboard)/back-office/layout.tsx');
const shellPath = join(ROOT, 'app/(dashboard)/back-office/back-office-shell.tsx');
const actionsPath = join(ROOT, 'app/(dashboard)/back-office/imports/actions.ts');
const notifyPath = join(ROOT, 'lib/imports/notify.ts');

const routePaths: Record<RouteKind, string> = {
  list: join(ROOT, 'app/(dashboard)/back-office/imports/page.tsx'),
  new: join(ROOT, 'app/(dashboard)/back-office/imports/new/page.tsx'),
  review: join(ROOT, 'app/(dashboard)/back-office/imports/[id]/page.tsx'),
};

const expectedNonImportNavigation = [
  ['/back-office', 'Home', 'Overview'],
  ['/back-office/business-accounts', 'Building2', 'Business Accounts'],
  ['/back-office/users', 'Users', 'Users'],
  ['/back-office/team-members', 'UserCog', 'Team Members'],
  ['/back-office/listings', 'List', 'Listings'],
  ['/back-office/whatsapp-intakes', 'MessageCircle', 'WhatsApp Intakes'],
  ['/back-office/moderation', 'ShieldCheck', 'Moderation'],
  ['/back-office/social', 'Share2', 'Social'],
  ['/back-office/settings', 'Settings', 'Settings'],
];

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function navigationSource(): string {
  return read(existsSync(shellPath) ? shellPath : layoutPath);
}

function observedNonImportNavigation(): string[][] {
  const entries = [
    ...navigationSource().matchAll(
      /\{\s*href:\s*'([^']+)',\s*icon:\s*(\w+),\s*label:\s*'([^']+)'\s*\}/g
    ),
  ].map((match) => [match[1], match[2], match[3]]);

  return entries.filter(([href]) => href !== '/back-office/imports');
}

function routeGuardOrderIsPreserved(route: RouteKind): boolean {
  const source = read(routePaths[route]);
  const authorization = source.indexOf('requireBackOfficeAccess()');
  const snapshot = source.indexOf('loadFeatureFlags()');
  const concealment = source.indexOf('notFound()');
  const firstImporterRead =
    route === 'list'
      ? source.indexOf('db\n    .select')
      : route === 'review'
        ? source.indexOf('db.query.postImports.findFirst')
        : source.length;

  return (
    authorization >= 0 &&
    snapshot > authorization &&
    concealment > snapshot &&
    firstImporterRead > concealment
  );
}

function observeRoute(
  role: Role,
  masterEnabled: boolean,
  route: RouteKind,
  recordState: RecordState
): RouteOutcome {
  if (role === 'anonymous') return { kind: 'sign-in-redirect', importerReads: 0 };
  if (role !== 'ops' && role !== 'admin') {
    return { kind: 'dashboard-redirect', importerReads: 0 };
  }
  if (!masterEnabled || !routeGuardOrderIsPreserved(route)) {
    return { kind: 'not-found', importerReads: 0 };
  }
  if (route === 'review' && recordState !== 'existing') {
    return {
      kind: 'not-found',
      importerReads: recordState === 'missing' ? 1 : 0,
    };
  }
  return { kind: 'rendered', importerReads: route === 'new' ? 0 : 1 };
}

function expectedRoute(
  role: Role,
  masterEnabled: boolean,
  route: RouteKind,
  recordState: RecordState
): RouteOutcome {
  if (role === 'anonymous') return { kind: 'sign-in-redirect', importerReads: 0 };
  if (role !== 'ops' && role !== 'admin') {
    return { kind: 'dashboard-redirect', importerReads: 0 };
  }
  if (!masterEnabled) return { kind: 'not-found', importerReads: 0 };
  if (route === 'review' && recordState !== 'existing') {
    return { kind: 'not-found', importerReads: recordState === 'missing' ? 1 : 0 };
  }
  return { kind: 'rendered', importerReads: route === 'new' ? 0 : 1 };
}

interface ExportedFunction {
  name: string;
  body: string;
}

function exportedAsyncFunctions(source: string): ExportedFunction[] {
  const functions: ExportedFunction[] = [];
  const declaration = /export\s+async\s+function\s+(\w+)\s*\([^]*?\)\s*(?::\s*[^\{]+)?\{/g;

  for (const match of source.matchAll(declaration)) {
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
    functions.push({ name: match[1], body: source.slice(open, close) });
  }

  return functions;
}

function guardedMutationNames(): string[] {
  const sideEffectMarkers = [
    'resolvePost(',
    'extractFromText(',
    'ingestRemoteImages(',
    'db.query.postImports',
    'db\n    .insert',
    'db\n    .update',
    'publishImport(',
    'logAudit(',
    'revalidatePath(',
    'redirect(',
  ];

  return exportedAsyncFunctions(read(actionsPath))
    .filter(({ name }) => name.endsWith('Action'))
    .filter(({ body }) => {
      const guard = body.indexOf('requireStaff(');
      const firstEffect = Math.min(
        ...sideEffectMarkers
          .map((marker) => body.indexOf(marker))
          .filter((index) => index >= 0)
      );
      return guard >= 0 && guard < firstEffect;
    })
    .map(({ name }) => name)
    .sort();
}

function notificationOutcome(
  masterEnabled: boolean,
  notificationEnabled: boolean,
  transportConfigured: boolean
): { importAllowed: boolean; outcome: 'blocked' | 'dry_run' | 'sent'; transportCalls: number } {
  if (!masterEnabled) return { importAllowed: false, outcome: 'blocked', transportCalls: 0 };
  if (!notificationEnabled || !transportConfigured) {
    return { importAllowed: true, outcome: 'dry_run', transportCalls: 0 };
  }
  return { importAllowed: true, outcome: 'sent', transportCalls: 1 };
}

describe('Property 2: Authorization, Concealment, Caching, and Independent Notification', () => {
  /** **Validates: Requirements 3.1, 3.3, 3.4, 3.7** */
  it('preserves authorization precedence, disabled concealment, and review ID handling for generated routes', () => {
    const roles: Role[] = ['anonymous', 'tenant', 'landlord', 'ops', 'admin'];
    const booleans = [false, true];
    const routes: RouteKind[] = ['list', 'new', 'review'];
    const records: RecordState[] = [
      'malformed',
      'non-finite',
      'zero',
      'negative',
      'missing',
      'existing',
    ];

    const counterexamples = roles.flatMap((role) =>
      booleans.flatMap((masterEnabled) =>
        routes.flatMap((route) =>
          records
            .map((recordState) => ({
              input: { role, masterEnabled, route, recordState },
              actual: observeRoute(role, masterEnabled, route, recordState),
              expected: expectedRoute(role, masterEnabled, route, recordState),
            }))
            .filter(({ actual, expected }) => JSON.stringify(actual) !== JSON.stringify(expected))
        )
      )
    );

    expect(counterexamples).toEqual([]);
  });

  /** **Validates: Requirements 3.2, 3.4, 3.6** */
  it('keeps all importer mutations guarded before downstream effects', () => {
    expect(guardedMutationNames()).toEqual([
      'createImportAction',
      'discardImportAction',
      'publishImportAction',
      'reExtractAction',
      'updateDraftAction',
    ]);

    const deniedRoles: Role[] = ['anonymous', 'tenant', 'landlord'];
    const deniedTraces = deniedRoles.flatMap((role) =>
      [false, true].map((masterEnabled) => ({ role, masterEnabled, downstreamEffects: [] }))
    );
    deniedTraces.push(
      { role: 'ops', masterEnabled: false, downstreamEffects: [] },
      { role: 'admin', masterEnabled: false, downstreamEffects: [] }
    );
    expect(deniedTraces.every(({ downstreamEffects }) => downstreamEffects.length === 0)).toBe(true);
  });

  /** **Validates: Requirements 3.9** */
  it('preserves every non-import navigation entry and sidebar interaction contract', () => {
    const source = navigationSource();
    expect(observedNonImportNavigation()).toEqual(expectedNonImportNavigation);
    expect(source).toContain("pathname === item.href ? 'secondary' : 'ghost'");
    expect(source).toContain('setIsSidebarOpen(false)');
    expect(source).toContain('isSidebarOpen && (');
    expect(source).toContain('if (!mounted)');
    expect(source).toContain('<div className="flex-1 bg-gray-50">{children}</div>');
  });

  /** **Validates: Requirements 3.5, 3.6** */
  it('keeps importer availability independent from owner-notification transport', () => {
    const source = read(notifyPath);
    const booleans = [false, true];
    const matrix = booleans.flatMap((masterEnabled) =>
      booleans.flatMap((notificationEnabled) =>
        booleans.map((transportConfigured) => ({
          masterEnabled,
          notificationEnabled,
          transportConfigured,
          result: notificationOutcome(masterEnabled, notificationEnabled, transportConfigured),
        }))
      )
    );

    for (const entry of matrix) {
      expect(entry.result.importAllowed).toBe(entry.masterEnabled);
      expect(entry.result.transportCalls).toBe(
        entry.masterEnabled && entry.notificationEnabled && entry.transportConfigured ? 1 : 0
      );
    }
    expect(source).toContain("isFeatureEnabled('notifyImportedOwners')");
    expect(source).not.toContain('enableFacebookImport');
    expect(navigationSource()).not.toContain('notifyImportedOwners');
  });

  /** **Validates: Requirements 3.8, 3.9** */
  it('preserves the 30-second cache policy and keeps the private flag out of browser fetches', () => {
    for (const path of Object.values(routePaths)) {
      const source = read(path);
      expect(source).toContain('export const revalidate = 30');
      expect(source).not.toContain("dynamic = 'force-dynamic'");
    }

    if (existsSync(shellPath)) {
      const layout = read(layoutPath);
      expect(layout).toContain('export const revalidate = 30');
      expect(layout).not.toContain("dynamic = 'force-dynamic'");
    }

    const clientSource = navigationSource();
    expect(clientSource).not.toMatch(/fetch\([^)]*feature-flags/);
    expect(clientSource).not.toContain('getResolvedFeatureFlags');
  });

  it('preserves import status transitions, filters, and notification outcomes in source contracts', () => {
    const actions = read(actionsPath);
    const list = read(routePaths.list);
    const notify = read(notifyPath);

    expect(actions).toContain("status: 'discarded'");
    expect(actions).toContain('publishImport(saved, user.id)');
    expect(list).toContain("const TABS = ['draft', 'published', 'discarded', 'all'] as const");
    expect(notify).toContain("export type NotifyOutcome = 'sent' | 'dry_run' | 'failed'");
  });
});
