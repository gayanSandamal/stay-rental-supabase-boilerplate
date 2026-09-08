'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Loader2, RefreshCw, Save, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ImageUploader } from '@/components/image-uploader';
import {
  discardImportAction,
  publishImportAction,
  reExtractAction,
  updateDraftAction,
} from '../actions';

/**
 * The screen that always works.
 *
 * Facebook hands over the full post only for pages we own, a truncated preview
 * for some public posts, and nothing at all for groups. So this is not a
 * "confirm what we found" form — it is a listing editor that happens to come
 * pre-filled when we were lucky. The raw-text box and the uploader are the
 * primary controls, not a fallback bolted on the side.
 *
 * PUBLISH IS DISABLED UNTIL A PHONE NUMBER IS CHOSEN. Publishing messages that
 * person and creates an account against their number; a regex guess is a
 * starting point for a human, never authority to do either.
 */

export interface ReviewParsed {
  title: string | null;
  description: string | null;
  propertyType: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  rentPerMonth: number | null;
}

export function ReviewForm({
  importId,
  status,
  resolvedVia,
  sourcePlatform,
  rawText,
  parsed,
  photos,
  ownerName,
  ownerPhone,
  phoneCandidates,
  saleAd,
  shareOnSocial,
}: {
  importId: number;
  status: string;
  resolvedVia: string;
  sourcePlatform: string;
  rawText: string;
  parsed: ReviewParsed;
  photos: string[];
  ownerName: string | null;
  ownerPhone: string | null;
  phoneCandidates: string[];
  saleAd: boolean;
  shareOnSocial: boolean;
}) {
  const [pending, start] = useTransition();
  const [photoUrls, setPhotoUrls] = useState<string[]>(photos);
  const [phone, setPhone] = useState(ownerPhone ?? '');
  /*
   * The four fields publish actually requires are CONTROLLED, the rest are not.
   * Not consistency for its own sake: the main path here is an operator pasting
   * a group post and typing these in, and reading them from the server-side
   * parse would leave Publish disabled while they stare at a filled-in form.
   */
  const [required, setRequired] = useState({
    title: parsed.title ?? '',
    city: parsed.city ?? '',
    bedrooms: parsed.bedrooms == null ? '' : String(parsed.bedrooms),
    rentPerMonth: parsed.rentPerMonth == null ? '' : String(parsed.rentPerMonth),
  });
  const setField = (key: keyof typeof required) => (value: string) =>
    setRequired((prev) => ({ ...prev, [key]: value }));

  const published = status === 'published';
  const discarded = status === 'discarded';
  const locked = published || discarded || pending;

  const missing = requiredMissing(required, phone);

  return (
    <div className="max-w-4xl space-y-6">
      {resolvedVia === 'manual' && !published && (
        <section className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {sourcePlatform === 'facebook_group'
              ? 'Facebook does not allow group posts to be read automatically — it removed that API in April 2024.'
              : 'Facebook served a login wall instead of this post.'}{' '}
            Open the original, copy its text into the box below, press{' '}
            <strong>Fill empty fields</strong>, and add the photos.
          </p>
        </section>
      )}

      {resolvedVia === 'og' && !published && (
        <section className="flex gap-3 rounded-md border border-sky-300 bg-sky-50 px-3 py-3 text-sm text-sky-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Only Facebook&rsquo;s public preview came back — usually just the first line
            of the post and the cover photo. The rest of the ad, including the phone
            number, is not in what Facebook sends us. Paste the full text below and add
            the other photos.
          </p>
        </section>
      )}

      {saleAd && !published && (
        <section className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            This reads like a property <strong>for sale</strong>, not for rent. Easy Rent
            is a rental marketplace — check the original before publishing.
          </p>
        </section>
      )}

      {published && (
        <section className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          This import has been published. Edit the listing itself from now on — changing
          the draft here would no longer match what is live.
        </section>
      )}

      {/* Re-read is its own form: it replaces the parse, so it must not be
          submitted by accident alongside the field edits. */}
      {!locked && (
        <form action={(fd) => start(() => reExtractAction(fd))} className="space-y-2">
          <input type="hidden" name="importId" value={importId} />
          <Label htmlFor="rawText">Post text</Label>
          <textarea
            id="rawText"
            name="rawText"
            defaultValue={rawText}
            rows={8}
            placeholder="Paste the whole Facebook post here — rent, rooms, town, phone number, all of it."
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-xs focus-visible:border-teal-500 focus-visible:outline-none"
          />
          <div className="flex items-center gap-3">
            <Button type="submit" variant="outline" size="sm" disabled={pending}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Fill empty fields
            </Button>
            <span className="text-xs text-slate-500">
              Reads this text into any field still blank. Anything you have already set
              is left alone.
            </span>
          </div>
        </form>
      )}

      <form className="space-y-6">
        <input type="hidden" name="importId" value={importId} />

        <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-slate-900">
            Listing details
          </legend>

          <Field
            label="Title"
            name="title"
            value={required.title}
            onValueChange={setField('title')}
            required
          />
          <Field
            label="Property type"
            name="propertyType"
            defaultValue={parsed.propertyType}
            placeholder="house / apartment / room"
          />
          <Field
            label="Town / city"
            name="city"
            value={required.city}
            onValueChange={setField('city')}
            required
          />
          <Field label="District" name="district" defaultValue={parsed.district} />
          <Field
            label="Bedrooms"
            name="bedrooms"
            type="number"
            value={required.bedrooms}
            onValueChange={setField('bedrooms')}
            required
          />
          <Field
            label="Bathrooms"
            name="bathrooms"
            type="number"
            defaultValue={parsed.bathrooms}
          />
          <Field
            label="Rent per month (LKR)"
            name="rentPerMonth"
            type="number"
            value={required.rentPerMonth}
            onValueChange={setField('rentPerMonth')}
            required
          />
          <Field label="Address" name="address" defaultValue={parsed.address} />

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              defaultValue={parsed.description ?? ''}
              rows={5}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-xs focus-visible:border-teal-500 focus-visible:outline-none"
            />
          </div>
        </fieldset>

        <fieldset disabled={locked} className="space-y-3">
          <legend className="mb-2 text-sm font-semibold text-slate-900">
            Owner
            <span className="ml-1 font-normal text-rose-600">required</span>
          </legend>
          <p className="text-sm text-slate-500">
            Publishing creates an account against this number and messages it. Confirm it
            against the original post — nobody has verified it.
          </p>

          {phoneCandidates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {phoneCandidates.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => setPhone(candidate)}
                  className={`rounded-md border px-2.5 py-1 text-sm ${
                    phone === candidate
                      ? 'border-teal-500 bg-teal-50 text-teal-900'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {candidate}
                </button>
              ))}
              <span className="self-center text-xs text-slate-500">
                found in the post text
              </span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ownerPhone">Phone number</Label>
              <Input
                id="ownerPhone"
                name="ownerPhone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+94771234567"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ownerName">Owner name</Label>
              <Input
                id="ownerName"
                name="ownerName"
                defaultValue={ownerName ?? ''}
                placeholder="Leave blank if the post is anonymous"
              />
              <p className="text-xs text-slate-500">
                Optional — Facebook never gives us the author, and an anonymous post has
                none.
              </p>
            </div>
          </div>
        </fieldset>

        <fieldset disabled={locked} className="space-y-2">
          <legend className="mb-2 text-sm font-semibold text-slate-900">Photos</legend>
          <ImageUploader value={photoUrls} onChange={setPhotoUrls} disabled={locked} />
          <p className="text-xs text-slate-500">
            Facebook only ever hands over the cover photo. Save the rest from the
            original post and drop them here.
          </p>
          {photoUrls.map((url) => (
            <input key={`photo-${url}`} type="hidden" name="photoUrls" value={url} />
          ))}
        </fieldset>

        <fieldset disabled={locked} className="space-y-2">
          <legend className="mb-2 text-sm font-semibold text-slate-900">
            Our social channels
          </legend>
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
            <input
              type="checkbox"
              name="shareOnSocial"
              defaultChecked={shareOnSocial}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-slate-900">
                Also post this to Easy Rent&rsquo;s Facebook, Instagram and TikTok
              </span>
              {/*
                Said plainly on purpose. The landlord-facing checkbox is someone
                consenting about their own property; this is an operator
                consenting about a stranger's, and the screen should not let that
                pass unnoticed.
              */}
              <span className="block text-xs text-slate-500">
                Queued when the listing goes live. The owner has not been asked — the
                consent is recorded as yours. Phone numbers are never included in a
                post.
              </span>
            </span>
          </label>
        </fieldset>

        {!locked && (
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
            <Button
              type="submit"
              formAction={(fd) => start(() => publishImportAction(fd))}
              disabled={missing.length > 0 || pending}
            >
              {pending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-4 w-4" />
              )}
              Publish and notify owner
            </Button>

            <Button
              type="submit"
              variant="outline"
              formAction={(fd) => start(() => updateDraftAction(fd))}
              disabled={pending}
            >
              <Save className="mr-1.5 h-4 w-4" />
              Save draft
            </Button>

            <Button
              type="submit"
              variant="ghost"
              formAction={(fd) => start(() => discardImportAction(fd))}
              disabled={pending}
              className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Discard
            </Button>

            {missing.length > 0 && (
              <span className="text-xs text-slate-500">
                Still needed: {missing.join(', ')}.
              </span>
            )}
          </div>
        )}
      </form>
    </div>
  );
}

/**
 * The same four listing fields publishImport insists on, plus the phone.
 * Duplicated in the client so the button explains itself before the round trip;
 * the server check is the one that decides.
 */
function requiredMissing(
  fields: { title: string; city: string; bedrooms: string; rentPerMonth: string },
  phone: string
): string[] {
  const missing: string[] = [];
  if (!fields.title.trim()) missing.push('title');
  if (!fields.city.trim()) missing.push('town');
  if (!fields.bedrooms.trim()) missing.push('bedrooms');
  if (!fields.rentPerMonth.trim()) missing.push('rent');
  if (!phone.trim()) missing.push('phone number');
  return missing;
}

/** Controlled when `value`/`onValueChange` are given, uncontrolled otherwise. */
function Field({
  label,
  name,
  defaultValue,
  value,
  onValueChange,
  type = 'text',
  required,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  value?: string;
  onValueChange?: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>
        {label}
        {required && <span className="ml-1 text-rose-600">*</span>}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        {...(onValueChange
          ? { value: value ?? '', onChange: (e) => onValueChange(e.target.value) }
          : { defaultValue: defaultValue ?? '' })}
      />
    </div>
  );
}
