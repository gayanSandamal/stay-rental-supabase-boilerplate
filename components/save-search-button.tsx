'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { BookmarkPlus, Loader2 } from 'lucide-react';
import useSWR from 'swr';
import { User } from '@/lib/db/schema';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function SaveSearchButton() {
  const searchParams = useSearchParams();
  const { data: user } = useSWR<User>('/api/user', fetcher);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const searchParamsObj: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    searchParamsObj[key] = value;
  });

  const hasFilters = Object.keys(searchParamsObj).length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/saved-searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          searchParams: searchParamsObj,
          emailAlerts: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save search');
      }
      setOpen(false);
      setName('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save search');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <BookmarkPlus className="h-4 w-4" />
          Save this search
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Save search alert</DialogTitle>
            <DialogDescription>
              {hasFilters
                ? 'Get notified when new listings match your current filters.'
                : 'Save your current search to get alerts for new listings. Add filters above for better results.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="search-name">Name</Label>
            <Input
              id="search-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Colombo 2-bed under 50k"
              className="mt-2"
              required
            />
            {error && (
              <p className="text-sm text-red-600 mt-2">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
