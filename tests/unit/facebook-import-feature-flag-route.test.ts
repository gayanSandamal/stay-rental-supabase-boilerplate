import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getResolvedFeatureFlags: vi.fn(),
  loadFeatureFlags: vi.fn(),
  setFeatureFlag: vi.fn(),
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/db/queries', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/feature-flags-store', () => ({
  loadFeatureFlags: mocks.loadFeatureFlags,
  setFeatureFlag: mocks.setFeatureFlag,
}));
vi.mock('@/lib/db/audit-logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/feature-flags', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/feature-flags')>();
  return { ...actual, getResolvedFeatureFlags: mocks.getResolvedFeatureFlags };
});

import { POST } from '@/app/api/back-office/feature-flags/route';

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/back-office/feature-flags', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ id: 17, role: 'admin' });
  mocks.getResolvedFeatureFlags.mockReturnValue({
    enableFacebookImport: false,
    notifyImportedOwners: false,
  });
  mocks.setFeatureFlag.mockResolvedValue(undefined);
  mocks.logAudit.mockResolvedValue(undefined);
});

describe('POST /api/back-office/feature-flags importer navigation refresh', () => {
  /** **Validates: Requirements 2.3, 2.5** */
  it.each([false, true])(
    'invalidates the persistent Back Office layout exactly once when the master flag becomes %s',
    async (value) => {
      const response = await POST(request({ flag: 'enableFacebookImport', value }));

      expect(response.status).toBe(200);
      expect(mocks.setFeatureFlag).toHaveBeenCalledWith('enableFacebookImport', value, 17);
      expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/back-office', 'layout');
    }
  );

  /** **Validates: Requirements 3.8, 3.9** */
  it('does not invalidate Back Office navigation for an unrelated flag', async () => {
    const response = await POST(
      request({ flag: 'notifyImportedOwners', value: true })
    );

    expect(response.status).toBe(200);
    expect(mocks.setFeatureFlag).toHaveBeenCalledWith('notifyImportedOwners', true, 17);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    [null, 401],
    [{ id: 18, role: 'ops' }, 403],
    [{ id: 19, role: 'landlord' }, 403],
  ])('does not write or invalidate when authorization fails', async (user, status) => {
    mocks.getUser.mockResolvedValue(user);

    const response = await POST(
      request({ flag: 'enableFacebookImport', value: true })
    );

    expect(response.status).toBe(status);
    expect(mocks.setFeatureFlag).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('does not write or invalidate malformed or type-invalid input', async () => {
    const response = await POST(
      request({ flag: 'enableFacebookImport', value: 1 })
    );

    expect(response.status).toBe(400);
    expect(mocks.setFeatureFlag).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('does not invalidate when the flag write fails', async () => {
    mocks.setFeatureFlag.mockRejectedValue(new Error('database unavailable'));

    await expect(
      POST(request({ flag: 'enableFacebookImport', value: true }))
    ).rejects.toThrow('database unavailable');
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
