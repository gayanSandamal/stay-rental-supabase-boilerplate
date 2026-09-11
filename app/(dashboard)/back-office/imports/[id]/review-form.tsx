'use client';

import { useState, useTransition } from 'react';
import {
  AlertTriangle,
  Copy,
  ImagePlus,
  Loader2,
  PhoneCall,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ImageUploader } from '@/components/image-uploader';
import { inviteCommentText } from '@/lib/imports/invite';
import { useFeatureFlag, useFeatureValue } from '@/lib/hooks/use-feature-flags';
import { capPhotos, effectiveCap } from '@/lib/images/cap';
import {
  addPhotoUrlsAction,
  discardImportAction,
  publishImportAction,
  publishManualConsentAction,
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
 * ASKING IS DISABLED UNTIL A PHONE NUMBER IS CHOSEN. The consent request goes to that
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
  depositMonths: number | null;
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
  allowManualConsent,
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
  allowManualConsent: boolean;
}) {
  const [pending, start] = useTransition();
  const [photoUrls, setPhotoUrls] = useState<string[]>(photos);
  const [manualConsentAttested, setManualConsentAttested] = useState(false);
  const [phone, setPhone] = useState(ownerPhone ?? '');
  /*
   * The pasted post text is CONTROLLED and mirrored into the editor form below.
   *
   * It lives in the re-extract form, which is a different <form> element from
   * the one Save and Publish submit — so an operator who pasted the whole ad
   * and then pressed "Save draft" used to lose every word of it. On a group
   * post that paste IS the import: it carries the rent, the town and the phone
   * number Facebook never sends. Losing it silently read as "extraction is
   * broken", because the phone-candidate chips are recomputed from the STORED
   * text and stayed empty too.
   */
  const [postText, setPostText] = useState(rawText);
  const [copied, setCopied] = useState(false);
  /*
   * Built client-side: the support number is NEXT_PUBLIC_WHATSAPP_SUPPORT, so
   * it renders in both places, and null when unset — which hides the whole
   * block rather than offering a comment with a dead link in it.
   */
  const inviteComment = inviteCommentText(importId);
  /*
   * The four fields publish actually requires are CONTROLLED, the rest are not.
   * Not consistency for its own sake: the main path here is an operator pasting
   * a group post and typing these in, and reading them from the server-side
   * parse would leave the ask disabled while they stare at a filled-in form.
   */
  const [required, setRequired] = useState({
    title: parsed.title ?? '',
    city: parsed.city ?? '',
    bedrooms: parsed.bedrooms == null ? '' : String(parsed.bedrooms),
    rentPerMonth: parsed.rentPerMonth == null ? '' : String(parsed.rentPerMonth),
  });
  const setField = (key: keyof typeof required) => (value: string) =>
    setRequired((prev) => ({ ...prev, [key]: value }));

  /*
   * The same two flags and the same two functions publishImport uses, so the
   * warning below and the photos actually dropped can never disagree.
   * `enforcePhotoCap` matters as much as the number: with it off nothing is
   * dropped at all, and a warning about a cap that is not applied would send an
   * operator deleting photos for no reason.
   */
  const photoCap = effectiveCap(
    useFeatureFlag('enforcePhotoCap'),
    useFeatureValue('maxPhotosPerListing')
  );
  const overCap = capPhotos(photoUrls, photoCap).dropped.length;

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

      {/*
        The other way to get this listing, and usually the better one.

        Everything the review screen is working around — the missing body, the
        album behind the login wall, the absent name and number — arrives
        intact if the owner sends it themselves. This is also unambiguous
        consent, where the WhatsApp ask is a Marketing template that a
        recipient with marketing messages switched off never receives.
      */}
      {!published && !discarded && inviteComment && (
        <section className="space-y-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
          <p className="text-sm font-semibold text-slate-900">
            Or ask the owner to send it to us
          </p>
          <p className="text-xs text-slate-600">
            Paste this as a comment on the original post. If they message us, the
            listing arrives complete — every photo, the full text, their name and a
            number WhatsApp has proven — and nothing here needs guessing. Facebook does
            not allow comments to be posted automatically, so this one is by hand.
          </p>
          <textarea
            readOnly
            rows={7}
            value={inviteComment}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard
                ?.writeText(inviteComment)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
          >
            <Copy className="mr-1.5 h-4 w-4" />
            {copied ? 'Copied' : 'Copy comment'}
          </Button>
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
            value={postText}
            onChange={(e) => setPostText(e.target.value)}
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
        {/* The paste, mirrored out of the re-extract form above so Save and
            Publish persist it too. Without this the two forms are separate
            submissions and the text is only ever stored by "Fill empty
            fields" — which an operator has no reason to press if the fields
            are already filled. */}
        <input type="hidden" name="rawText" value={postText} />

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
            /* listings.title is varchar(200) and Postgres raises 22001 rather
               than truncating, so a pasted headline longer than this used to
               come back as an unhandled server-action error instead of a
               validation message. Mirrored server-side in mergeParsedFromForm. */
            maxLength={200}
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
          <Field
            label="Deposit (months)"
            name="depositMonths"
            type="number"
            defaultValue={parsed.depositMonths}
            placeholder="e.g. 3"
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
            We message this number to ask permission, and create their account only if
            they say yes. Confirm it
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
            Facebook only ever hands over the cover photo. Add the rest by uploading them
            above, copying an image from the post and pressing Ctrl+V / ⌘V, or pasting
            their URLs below.
          </p>

          {/*
            The cap is applied at PUBLISH — capPhotos records the extras in the
            manifest as rejects — and the uploader blocks a file past it, but
            pasted URLs go through addPhotoUrlsAction, which has no such check.
            So an operator could hold more photos than will ever be published
            and be told nothing until they compared the live listing with the
            draft. Saying which ones is the point: the cover controls below
            reorder the album, so this is a choice rather than an accident.
          */}
          {overCap > 0 && (
            <p className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
              <span>
                Only the first {photoCap} publish, so{' '}
                {overCap === 1 ? 'the last one' : `the last ${overCap}`} will be left
                out. Reorder them below to choose which.
              </span>
            </p>
          )}

          {/* Paste image URLs. Only Facebook's own photo CDN is fetched — the
              server dereferences whatever is typed here, so the host is checked
              before a socket is opened. */}
          <div className="space-y-1.5 pt-1">
            <Label htmlFor="imageUrls">Add photos by URL</Label>
            <textarea
              id="imageUrls"
              name="imageUrls"
              rows={2}
              placeholder="Right-click each photo in the post → Copy image address, then paste them here (one per line)."
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-xs focus-visible:border-teal-500 focus-visible:outline-none"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={locked}
              formAction={(fd) => start(() => addPhotoUrlsAction(fd))}
            >
              <ImagePlus className="mr-1.5 h-4 w-4" />
              Fetch photos
            </Button>
            <p className="text-xs text-slate-500">
              Copies the images into our own storage — Facebook&rsquo;s links are signed
              and expire, so a draft opened tomorrow would otherwise lose them. Saves
              your other edits at the same time.
            </p>
          </div>

          {/* Which photo leads. Until now it was whichever URL happened to be
              ingested first, with no way to change it. */}
          {photoUrls.length > 1 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-xs font-medium text-slate-700">
                Cover photo — the one renters see first in search results.
              </p>
              <div className="flex flex-wrap gap-2">
                {photoUrls.map((url, index) => (
                  <Button
                    key={`cover-${url}`}
                    type="button"
                    variant={index === 0 ? 'default' : 'outline'}
                    size="sm"
                    disabled={locked || index === 0}
                    onClick={() =>
                      setPhotoUrls((prev) => [
                        prev[index],
                        ...prev.filter((_, i) => i !== index),
                      ])
                    }
                  >
                    {index === 0 ? 'Cover: photo 1' : `Make photo ${index + 1} the cover`}
                  </Button>
                ))}
              </div>
            </div>
          )}

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
                This used to read "the owner has not been asked — the consent is
                recorded as yours", which was the honest label under the opt-OUT
                flow: the operator decided alone. Migration 0060 inverted that.
                CONSENT_TEMPLATE_TEXT (lib/imports/message.ts) now names Facebook,
                Instagram and TikTok in the ask itself, which is why publishImport
                records socialConsentSource: 'whatsapp' and audits ownerAsked:
                true. The screen was telling the operator the opposite of what the
                database was recording.

                Note the ask does not vary with this box — the template always
                requests social permission. Unchecking does not narrow what we
                asked for; it declines to use permission the owner gave.
              */}
              <span className="block text-xs text-slate-500">
                {allowManualConsent
                  ? 'Queued when the listing goes live. If the owner answers our WhatsApp template, their yes already covers this. If you get consent yourself instead — a call, a chat — only check this box when the owner actually agreed to social sharing too; the template names Facebook, Instagram and TikTok explicitly, and a phone call might not have. Phone numbers are never included in a post.'
                  : 'Queued when the listing goes live. The permission request already asks for this, so the owner’s yes covers it. Phone numbers are never included in a post.'}
              </span>
            </span>
          </label>
        </fieldset>

        {/*
          Ops-only alternative to the WhatsApp ask, gated behind
          allowManualImportConsent. The checkbox is an attestation, not a
          formality: publishManualConsentAction refuses to run without it,
          server-side, regardless of what this client sends. It stays
          unchecked on every render (no defaultChecked) so re-opening this
          screen — or a "Fill empty fields" remount — never carries a stale
          yes forward.
        */}
        {allowManualConsent && !locked && (
          <fieldset className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
            <legend className="mb-1 px-1 text-sm font-semibold text-amber-900">
              Already have the owner&rsquo;s consent?
            </legend>
            <p className="text-xs text-amber-800">
              For when the WhatsApp consent template isn&rsquo;t registered yet, or
              calling is just faster. This publishes immediately on your word instead of
              waiting on a template reply — it is recorded as your attestation, not the
              owner&rsquo;s own WhatsApp yes, and is fully audited.
            </p>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-amber-900">
              <input
                type="checkbox"
                name="manualConsentAttested"
                checked={manualConsentAttested}
                onChange={(e) => setManualConsentAttested(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I confirm I have spoken to <strong>{ownerName || 'the owner'}</strong>{' '}
                directly and they agreed to list this property on Easy Rent
                {shareOnSocial ? ', and to share it on our social channels' : ''}.
              </span>
            </label>
          </fieldset>
        )}

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
              Ask the owner for consent
            </Button>

            {allowManualConsent && (
              <Button
                type="submit"
                variant="outline"
                formAction={(fd) => start(() => publishManualConsentAction(fd))}
                disabled={missing.length > 0 || !manualConsentAttested || pending}
                className="border-amber-400 text-amber-900 hover:bg-amber-50"
              >
                {pending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <PhoneCall className="mr-1.5 h-4 w-4" />
                )}
                Publish — I already have consent
              </Button>
            )}

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
  maxLength,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  value?: string;
  onValueChange?: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
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
        maxLength={maxLength}
        {...(onValueChange
          ? { value: value ?? '', onChange: (e) => onValueChange(e.target.value) }
          : { defaultValue: defaultValue ?? '' })}
      />
    </div>
  );
}
