import { supabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase';
import { GRAPH_API_BASE, whatsappConfig } from './config';

/**
 * One transient failure must not lose a landlord's photo (live launch saw 2
 * of 5 album downloads fail): retry each Graph hop once with a short backoff.
 * A fresh AbortSignal per attempt — signals are single-use.
 */
async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok || attempt === 1) return res;
      console.error('WhatsApp media fetch retrying', url.slice(0, 60), res.status);
    } catch (err) {
      lastErr = err;
      if (attempt === 1) throw err;
      console.error('WhatsApp media fetch retrying after error', err);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw lastErr;
}

/**
 * Download a WhatsApp media object and persist it to Supabase storage.
 * Cloud API media URLs are short-lived (minutes), so this runs inside the
 * webhook handler, not the cron. Returns the public URL, or null on failure
 * (the intake still proceeds — photos are optional at intake time).
 */
export async function persistWhatsAppMedia(mediaId: string): Promise<string | null> {
  try {
    const auth = { authorization: `Bearer ${whatsappConfig.accessToken}` };
    const metaRes = await fetchWithRetry(`${GRAPH_API_BASE}/${mediaId}`, auth, 15_000);
    if (!metaRes.ok) {
      // An expired/revoked access token silently dropping every photo is the
      // failure mode ops most needs to see in the logs.
      console.error('WhatsApp media metadata fetch failed', mediaId, metaRes.status, await metaRes.text());
      return null;
    }
    const meta = await metaRes.json();
    if (!meta?.url) return null;

    const binRes = await fetchWithRetry(meta.url, auth, 20_000);
    if (!binRes.ok) {
      console.error('WhatsApp media download failed', mediaId, binRes.status);
      return null;
    }

    const mime: string = meta.mime_type || 'image/jpeg';
    if (!/^image\/(jpeg|png|webp)$/.test(mime)) return null;
    const ext = mime.split('/')[1];
    const buffer = Buffer.from(await binRes.arrayBuffer());
    // 5MB cap, matching the platform's upload limit
    if (buffer.byteLength > 5 * 1024 * 1024) return null;

    const path = `whatsapp-intake/${Date.now()}-${mediaId}.${ext}`;
    const { error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(path, buffer, { contentType: mime, cacheControl: '31536000' });
    if (error) {
      console.error('WhatsApp media upload failed', error.message);
      return null;
    }

    const { data } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error('WhatsApp media persist error', err);
    return null;
  }
}
