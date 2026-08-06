/**
 * The policy layer: every publish/hold/drop decision, as one pure function.
 * No I/O, no DB, no network — so the whole decision matrix is unit-testable.
 *
 * Owner decisions encoded here:
 *  - a flagged photo is DROPPED and the rest publish (cosmetic failures)
 *  - a SAFETY failure holds the whole listing instead (holdOnUnsafeImages)
 *  - unsupported language / incoherent text or location → hold for ops
 *  - never auto-set `rejected`: that status drives the rejection email and the
 *    landlord's re-review affordance, and stays a human decision
 */

import type {
  ImageVerdict,
  ModerationPolicy,
  ModerationVerdict,
  TextVerdict,
} from './types';

export interface CombineInput {
  text: TextVerdict | null;
  images: ImageVerdict[];
  policy: ModerationPolicy;
  model: string;
  promptVersion: number;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
  /** Set when the provider could not be reached after retries. */
  providerError?: string | null;
  /** Photos already published and previously passed (an edit adding new ones). */
  existingKeptUrls?: string[];
  /**
   * Photos refused for being over `maxPhotosPerListing`. Passed IN rather than
   * appended afterwards: the caller used to mutate `reasons` after `combine`
   * returned, so the landlord was never told and `imagesDropped` undercounted.
   */
  cappedOutUrls?: string[];
}

export function combine(input: CombineInput): ModerationVerdict {
  const {
    text,
    images,
    policy,
    model,
    promptVersion,
    usage,
    durationMs,
    providerError,
    existingKeptUrls = [],
    cappedOutUrls = [],
  } = input;

  const reasons: string[] = [];
  const landlordReasons: string[] = [];

  const base = {
    text,
    images,
    language: text?.language ?? null,
    model,
    promptVersion,
    usage,
    durationMs,
  };

  // Provider unreachable → fail closed unless explicitly told otherwise.
  if (providerError) {
    if (policy.failOpen) {
      return {
        ...base,
        outcome: 'passed',
        reasons: [`Moderation unavailable (${providerError}) — published under fail-open.`],
        landlordReasons: [],
        droppedUrls: [],
        keptUrls: [...existingKeptUrls, ...images.map((i) => i.originalUrl)],
        errorMessage: providerError,
      };
    }
    return {
      ...base,
      outcome: 'error',
      reasons: [`Moderation could not run: ${providerError}`],
      landlordReasons: [],
      droppedUrls: [],
      keptUrls: existingKeptUrls,
      errorMessage: providerError,
    };
  }

  const rejected = images.filter((i) => i.verdict === 'reject');
  const passed = images.filter((i) => i.verdict === 'pass');
  const unsafe = rejected.filter((i) => i.severity === 'safety');

  // Over-cap photos are dropped in every outcome, so fold them in once here.
  // They must never influence WHETHER we publish — being over a limit is an
  // administrative fact, not a moderation failure.
  const withCapped = (urls: string[]) => [...urls, ...cappedOutUrls];

  // 1. Safety trumps everything: a photo containing nudity/violence/harassment
  //    says something about the submitter, so publishing their other photos is
  //    worse than holding the listing for a human.
  if (policy.holdOnUnsafeImages && unsafe.length > 0) {
    reasons.push(
      `${unsafe.length} photo(s) flagged as unsafe: ${unsafe
        .flatMap((i) => i.reasons)
        .slice(0, 3)
        .join('; ')}`
    );
    // Deliberately vague to the sender — never coach someone around a filter.
    landlordReasons.push('Our team is reviewing your listing and will be in touch shortly.');
    return {
      ...base,
      outcome: 'held',
      holdReason: 'unsafe_image',
      reasons,
      landlordReasons,
      droppedUrls: withCapped(rejected.map((i) => i.originalUrl)),
      keptUrls: existingKeptUrls,
    };
  }

  // 2. Text checks. Only when enabled and actually run.
  if (policy.moderateTextCoherence && text) {
    if (!text.languageSupported) {
      reasons.push(`Unsupported language (${text.language}) — needs a human read.`);
      landlordReasons.push('Our team is reviewing your listing and will be in touch shortly.');
      return {
        ...base,
        outcome: 'held',
        holdReason: 'language',
        reasons,
        landlordReasons,
        droppedUrls: withCapped([]),
        keptUrls: existingKeptUrls,
      };
    }
    if (!text.looksLikeRental) {
      reasons.push(`Does not read like a rental listing: ${text.reasons.join('; ')}`);
      landlordReasons.push('Our team is reviewing your listing and will be in touch shortly.');
      return {
        ...base,
        outcome: 'held',
        holdReason: 'not_rental',
        reasons,
        landlordReasons,
        droppedUrls: withCapped([]),
        keptUrls: existingKeptUrls,
      };
    }
    if (!text.titleCoherent || !text.locationCoherent) {
      if (!text.titleCoherent) reasons.push(`Title/description mismatch: ${text.reasons.join('; ')}`);
      if (!text.locationCoherent) reasons.push(`Location inconsistent: ${text.reasons.join('; ')}`);
      landlordReasons.push('Our team is reviewing your listing and will be in touch shortly.');
      return {
        ...base,
        outcome: 'held',
        holdReason: 'incoherent',
        reasons,
        landlordReasons,
        droppedUrls: withCapped([]),
        keptUrls: existingKeptUrls,
      };
    }
  }

  // 2b. Over the photo limit: say so plainly, and say how to swap.
  if (cappedOutUrls.length) {
    const n = cappedOutUrls.length;
    reasons.push(`${n} photo(s) beyond the ${policy.maxImages}-photo limit.`);
    landlordReasons.push(
      `We can show ${policy.maxImages} photos per listing, so the last ${n === 1 ? 'one wasn’t' : `${n} weren’t`} used. ` +
        'Reply here any time to swap a photo for one of them.'
    );
  }

  // 3. Cosmetic image failures: drop them, publish the rest (owner decision).
  if (rejected.length > 0) {
    reasons.push(`${rejected.length} photo(s) dropped by automated checks.`);
    const detail = rejected
      .map((i, idx) => `${idx + 1}. ${i.reasons[0] ?? 'did not meet our photo rules'}`)
      .join('\n');
    const plural = rejected.length === 1 ? 'photo' : 'photos';
    landlordReasons.push(
      `${rejected.length} ${plural} couldn't be used:\n${detail}\nSend replacement ${plural} any time.`
    );
  }

  const keptUrls = [...existingKeptUrls, ...passed.map((i) => i.originalUrl)];

  // Publishing with no photos is allowed — photos are not a required field, and
  // holding a complete listing hostage over a bad photo helps nobody.
  if (rejected.length > 0 && passed.length === 0 && existingKeptUrls.length === 0) {
    reasons.push('All submitted photos were dropped — listing published without photos.');
  }

  return {
    ...base,
    outcome: 'passed',
    reasons: reasons.length ? reasons : ['All automated checks passed.'],
    landlordReasons,
    droppedUrls: withCapped(rejected.map((i) => i.originalUrl)),
    keptUrls,
  };
}

/** Short line stored on listings.moderation_summary for badges and queues. */
export function summarize(v: ModerationVerdict): string {
  if (v.outcome === 'passed') {
    const parts = ['Passed all checks'];
    if (v.droppedUrls.length) parts[0] = `Passed — ${v.droppedUrls.length} photo(s) dropped`;
    // Ops read this string in the back office; a degraded image pipeline has to
    // be legible there, not only in the manifest JSON.
    if (v.processingFallbacks) parts.push(`${v.processingFallbacks} unprocessed`);
    return parts.join(' · ').slice(0, 200);
  }
  if (v.outcome === 'held') return v.reasons[0]?.slice(0, 200) ?? 'Held for review';
  if (v.outcome === 'error') return `Moderation error: ${v.errorMessage ?? 'unknown'}`.slice(0, 200);
  return 'Moderation skipped';
}

/**
 * What `listings.status` should become. `null` means LEAVE IT ALONE.
 *
 * The load-bearing rule (I7) is the `wasLive` branch: once a listing is public,
 * a re-check may only take it dark for a SAFETY problem. Re-checks now happen
 * routinely — every time a landlord WhatsApps another photo — so treating a
 * flaky title-coherence read as grounds for unpublishing would mean a landlord
 * sending a nice photo of their kitchen can knock their own listing off the
 * site. Cosmetic problems drop the photo; text problems raise a flag for ops
 * and the listing stays up.
 */
export function nextListingStatus(input: {
  wasLive: boolean;
  verdict: ModerationVerdict;
  autoPublish: boolean;
}): 'active' | 'pending' | null {
  const { wasLive, verdict, autoPublish } = input;

  if (verdict.outcome === 'passed') {
    // Already live stays live; a first publish needs the auto-publish flag.
    return autoPublish || wasLive ? 'active' : 'pending';
  }
  if (verdict.outcome === 'held') {
    if (verdict.holdReason === 'unsafe_image') return 'pending'; // dark, always
    return wasLive ? null : 'pending';
  }
  // error / skipped: the run reached no conclusion, so it gets no opinion on
  // visibility. It will be retried.
  return null;
}
