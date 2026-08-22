import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { logAudit } from '@/lib/db/audit-logger';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { resolveAccessToken, touchAccessToken } from '@/lib/auth/access-links';

/**
 * Passwordless access links: /l/<token>[/e/<id>|/d/<id>|/s/<id>]
 *
 * Signs the landlord in and forwards them to their dashboard, a listing's edit
 * form, a delete confirmation page, or its social-post page.
 *
 * WHY THIS ROUTE EXISTS: the app's other link→session path
 * (app/auth/callback/route.ts) uses exchangeCodeForSession, which is PKCE and
 * needs the code-verifier cookie from the browser that STARTED the flow. A link
 * living in a WhatsApp thread is opened on whatever device the landlord happens
 * to hold, so that path can't work. Verifying a `token_hash` carries no
 * verifier, which is what makes this portable (proven in
 * scripts/spike-access-link.ts).
 *
 * SECURITY: the URL is a bearer credential. Anyone holding it becomes this
 * landlord — they can edit or archive that landlord's listings. Accepted
 * consciously and bounded: 90-day sliding expiry, a revocation column, an
 * audit row with IP + user-agent on every redemption so a hijack is detectable,
 * and no mutation on GET (the delete link lands on a confirmation page whose
 * action is a POST).
 */
export const dynamic = 'force-dynamic';

/** Link-preview fetchers must never burn a token or create a session. */
const BOT_UA = /facebookexternalhit|WhatsApp\/|Twitterbot|Slackbot|TelegramBot|Discordbot|bot|crawler|spider|preview/i;

function expired(reason: string): NextResponse {
  const res = NextResponse.redirect(
    new URL(`/link-expired?reason=${encodeURIComponent(reason)}`, process.env.NEXT_PUBLIC_BASE_URL || 'https://easyrent.lk')
  );
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('X-Robots-Tag', 'noindex');
  return res;
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ slug?: string[] }> }) {
  const ua = request.headers.get('user-agent') ?? '';
  if (BOT_UA.test(ua)) {
    // A harmless stub: WhatsApp fetches a preview for every link we send, and
    // that must not consume the link or mint a session for a crawler.
    return new NextResponse(
      '<!doctype html><title>Easy Rent</title><p>Open this link on your phone to manage your listing.</p>',
      { status: 200, headers: { 'content-type': 'text/html', 'X-Robots-Tag': 'noindex' } }
    );
  }

  const ip = getClientIp(request);
  const rl = checkRateLimit(ip, 'GET', '/l/:token');
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  const { slug = [] } = await ctx.params;
  const [token, action, idRaw] = slug;
  if (!token || token.length < 20) return expired('invalid');

  const resolved = await resolveAccessToken(token);
  if (!resolved.ok) return expired(resolved.reason);
  const { tokenId, userId, email, authUserId } = resolved.value;

  // Where are we sending them? Fixed path shapes, so there is no `next`
  // parameter to validate and no open-redirect surface.
  const listingId = idRaw && /^\d+$/.test(idRaw) ? Number(idRaw) : null;
  let destination = '/dashboard/listings';
  if (listingId && action === 'e') destination = `/dashboard/listings/${listingId}/edit`;
  else if (listingId && action === 'd') destination = `/dashboard/listings/${listingId}/delete`;
  // 's' — take this listing back off our social accounts. Like 'd' it lands on
  // a confirmation page, never on a mutation: a WhatsApp link preview or an
  // accidental long-press must not pull a live post down.
  else if (listingId && action === 's') destination = `/dashboard/listings/${listingId}/social`;

  const supabase = await createClient();

  // Already this landlord on this device? Skip the exchange entirely.
  const { data: current } = await supabase.auth.getUser();
  if (current?.user?.id && authUserId && current.user.id === authUserId) {
    await touchAccessToken(tokenId);
    return forward(destination);
  }
  // Signed in as someone else: clear THIS device's cookies only. `local` scope
  // deliberately — never revoke the other account's sessions on their devices.
  if (current?.user) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }

  // Mint a one-shot Supabase token and consume it immediately. Our own token is
  // the durable one; this exists for milliseconds, so its ~1h TTL is irrelevant.
  try {
    const admin = getSupabaseAdmin();
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    const hashed = link.data?.properties?.hashed_token;
    if (link.error || !hashed) {
      console.error('[access-link] generateLink failed', link.error?.message);
      // GoTrue rate-limits generateLink per address; tell them to retry rather
      // than implying the link is dead.
      return expired(/rate|frequency|seconds/i.test(link.error?.message ?? '') ? 'busy' : 'invalid');
    }

    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: hashed,
      type: 'magiclink',
    });
    if (verifyError) {
      console.error('[access-link] verifyOtp failed', verifyError.message);
      return expired('invalid');
    }
  } catch (err) {
    console.error('[access-link] session bridge crashed', err);
    return expired('invalid');
  }

  await touchAccessToken(tokenId);
  await logAudit({
    action: 'auth_link_redeemed',
    entityType: 'user',
    entityId: userId,
    userId,
    metadata: { listingId, action: action ?? 'dashboard', userAgent: ua.slice(0, 200) },
    ipAddress: ip,
  }).catch(() => {});

  return forward(destination);
}

function forward(destination: string): NextResponse {
  const res = NextResponse.redirect(
    new URL(destination, process.env.NEXT_PUBLIC_BASE_URL || 'https://easyrent.lk'),
    { status: 303 }
  );
  // A bodiless 303 leaks nothing via sub-resources; the header is belt and braces.
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Referrer-Policy', 'no-referrer');
  res.headers.set('X-Robots-Tag', 'noindex');
  return res;
}
