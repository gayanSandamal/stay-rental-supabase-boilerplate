'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import {
  featureFlagMeta,
  type FeatureFlag,
  type FeatureFlags,
  type FeatureFlagMeta,
} from '@/lib/feature-flags';

type Props = {
  flags: FeatureFlags;
  canEdit: boolean;
};

const GROUP_ORDER: FeatureFlagMeta['group'][] = ['Marketing', 'Platform', 'Configuration'];

const GROUP_BLURB: Record<FeatureFlagMeta['group'], string> = {
  Marketing: 'Public-site and monetization switches.',
  Platform: 'App-wide platform capabilities. Changes take effect within ~30 seconds across the app.',
  Configuration: 'Numeric configuration values.',
};

export function FeatureFlagsManager({ flags, canEdit }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, boolean | number>>({ ...flags });
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const keys = Object.keys(featureFlagMeta) as FeatureFlag[];

  async function save(flag: FeatureFlag, value: boolean | number, revert: boolean | number) {
    setPending(flag);
    setError(null);
    try {
      const res = await fetch('/api/back-office/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag, value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setValues((v) => ({ ...v, [flag]: revert }));
        setError(data.error || 'Failed to update flag.');
      } else {
        router.refresh();
      }
    } catch {
      setValues((v) => ({ ...v, [flag]: revert }));
      setError('Failed to update flag.');
    } finally {
      setPending(null);
    }
  }

  function toggle(flag: FeatureFlag, next: boolean) {
    const revert = values[flag] as boolean;
    setValues((v) => ({ ...v, [flag]: next }));
    void save(flag, next, revert);
  }

  return (
    <div className="space-y-8">
      {!canEdit && (
        <p className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          You can view feature flags but only an <span className="font-semibold">admin</span> can change them.
        </p>
      )}
      {error && (
        <p className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {GROUP_ORDER.map((group) => {
        const groupKeys = keys.filter((k) => featureFlagMeta[k].group === group);
        if (groupKeys.length === 0) return null;

        return (
          <section key={group}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{group}</h2>
            <p className="text-xs text-gray-500 mb-3">{GROUP_BLURB[group]}</p>
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
              {groupKeys.map((flag) => {
                const meta = featureFlagMeta[flag];
                const value = values[flag];
                const isBusy = pending === flag;

                return (
                  <div key={flag} className="flex items-start justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">{meta.label}</p>
                        {meta.appWide && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                            App-wide
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">{meta.description}</p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {isBusy && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                      {typeof value === 'boolean' ? (
                        <Switch
                          checked={value}
                          disabled={!canEdit || isBusy}
                          onCheckedChange={(next) => toggle(flag, next)}
                          aria-label={meta.label}
                        />
                      ) : (
                        <NumberField
                          value={value}
                          disabled={!canEdit || isBusy}
                          onSave={(next) => save(flag, next, value)}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function NumberField({
  value,
  disabled,
  onSave,
}: {
  value: number;
  disabled: boolean;
  onSave: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const dirty = draft.trim() !== String(value) && draft.trim() !== '';

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        className="h-9 w-24"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || !dirty}
        onClick={() => onSave(Number(draft))}
      >
        Save
      </Button>
    </div>
  );
}
