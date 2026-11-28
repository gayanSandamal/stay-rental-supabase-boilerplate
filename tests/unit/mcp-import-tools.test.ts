import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:1/test';
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:1';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test';
});
vi.mock('server-only', () => ({}));

import { importTools, missingForPublish } from '@/lib/mcp/tools/imports';
import type { ParsedIntake } from '@/lib/intake/parser/types';

const tool = (name: string) => importTools.find((t) => t.name === name)!;

describe('MCP import tools', () => {
  it('are admin-scoped and staff-only', () => {
    for (const t of importTools) {
      expect(t.scope).toBe('admin');
      expect(t.roles).toEqual(['ops', 'admin']);
    }
  });

  it('publishing demands an explicit owner-consent confirmation', () => {
    const input = tool('admin_publish_import').input;
    expect(input.safeParse({ importId: 1 }).success).toBe(false);
    expect(input.safeParse({ importId: 1, ownerConsentConfirmed: false }).success).toBe(false);
    expect(input.safeParse({ importId: 1, ownerConsentConfirmed: true }).success).toBe(true);
  });

  it('publishing is website-only unless social is asked for', () => {
    const parsed = tool('admin_publish_import').input.parse({ importId: 1, ownerConsentConfirmed: true });
    expect(parsed.shareOnSocial).toBe(false);
  });

  it('reports exactly what the review screen requires before publishing', () => {
    const base = { title: 'T', city: 'Kandy', bedrooms: 2, rentPerMonth: 50000 } as ParsedIntake;
    expect(missingForPublish({ ownerPhone: '+94771234567' }, base)).toEqual([]);
    expect(missingForPublish({ ownerPhone: null }, { ...base, bedrooms: null, city: null })).toEqual([
      'city',
      'bedrooms',
      'ownerPhone',
    ]);
  });
});
