import { supabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase';
import { GRAPH_API_BASE, whatsappConfig } from './config';

/**
 * Download a WhatsApp media object and persist it to Supabase storage.
 * Cloud API media URLs are short-lived (minutes), so this runs inside the
 * webhook handler, not the cron. Returns the public URL, or null on failure
 * (the intake still proceeds — photos are optional at intake time).
 */
export async function persistWhatsAppMedia(mediaId: string): Promise<string | null> {
  try {
    const metaRes = await fetch(`${GRAPH_API_BASE}/${mediaId}`, {
      headers: { authorization: `Bearer ${whatsappConfig.accessToken}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!metaRes.ok) {
      // An expired/revoked access token silently dropping every photo is the
      // failure mode ops most needs to see in the logs.
      console.error('WhatsApp media metadata fetch failed', mediaId, metaRes.status, await metaRes.text());
      return null;
    }
    const meta = await metaRes.json();
    if (!meta?.url) return null;

    const binRes = await fetch(meta.url, {
      headers: { authorization: `Bearer ${whatsappConfig.accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
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
