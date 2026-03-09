import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { storeImage } from '@/lib/storage';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
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

    if (files.length > 6) {
      return NextResponse.json(
        { error: 'Maximum 6 images allowed' },
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
