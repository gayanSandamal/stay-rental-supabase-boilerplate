/**
 * Facebook Group — the one target that cannot be automated at all.
 *
 * Meta removed the Groups API and the `publish_to_groups` permission on
 * 2024-04-22. There is no supported way for any application to post into a
 * group; the browser-extension workarounds that still exist drive a logged-in
 * session and breach the platform terms.
 *
 * So this "adapter" publishes nothing. It records the caption as a paste-ready
 * draft and reports `skipped`, which is what puts the row in front of ops in
 * Back Office → Social with a Copy button. Modelling it as an adapter rather
 * than a special case keeps the worker uniform and means the Group post is
 * tracked, attributed and auditable exactly like the automated ones.
 */

import type { PublishResult, SocialAdapter, SocialPostInput } from '../types';

async function publish(_input: SocialPostInput): Promise<PublishResult> {
  // Never "ok": a draft is not a post. The worker maps this to status
  // 'skipped' and notifies ops rather than counting it as published.
  return {
    ok: false,
    error: 'MANUAL_ONLY: Facebook Groups cannot be posted to via API (Groups API removed 2024-04-22)',
    retriable: false,
  };
}

async function remove(): Promise<boolean> {
  return false;
}

export const facebookGroupAdapter: SocialAdapter = {
  platform: 'facebook_group',
  // Always "configured": it needs no credentials, only a human.
  isConfigured: () => true,
  supportsRemove: false,
  publish,
  remove,
};

/** The worker recognises this prefix and parks the row for ops. */
export const MANUAL_ONLY_PREFIX = 'MANUAL_ONLY:';
