import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { loadFeatureFlags } from '@/lib/feature-flags-store';
import { photoCap } from '@/lib/images/cap';
import { storeImage } from '@/lib/storage';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    // photoCap() reads the flag snapshot, which is per-instance and lazy.
    await loadFeatureFlags();
    const ip = getClientIp(request);
    const rl = checkRateLimit(ip, 'POST', '/api/upload');
    if (!rl.allowed) return rateLimitResponse(rl.resetAt);

    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // PER-REQUEST only. There is no listing id here, and making the count
    // listing-aware would need an ownership lookup or the endpoint becomes an
    // enumeration oracle. The authoritative per-listing cap lives on
    // POST/PUT /api/listings, which is what closes the batched-upload bypass.
    const cap = photoCap();
    if (files.length > cap) {
      return NextResponse.json(
        { error: `Maximum ${cap} images allowed` },
        { status: 400 }
      );
    }

    const results = [];
    for (const file of files) {
      const result = await storeImage(file);
      results.push(result);
    }

    return NextResponse.json({ success: true, files: results }, { status: 201 });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Upload failed' },
      { status: 500 }
    );
  }
}
