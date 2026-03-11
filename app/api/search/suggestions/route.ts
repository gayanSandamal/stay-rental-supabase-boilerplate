import { NextRequest, NextResponse } from 'next/server';
import { getSearchSuggestions } from '@/lib/db/search-suggestions';

export const dynamic = 'force-dynamic';

// Edge caching: Cache-Control header caches at CDN for 60s

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q') ?? '';
    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get('limit') ?? '8', 10),
      8
    );

    if (q.trim().length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    const suggestions = await getSearchSuggestions(q.trim(), limit);

    const response = NextResponse.json({ suggestions: suggestions });

    // Optional: Cache-Control for edge/CDN (Vercel, Cloudflare)
    response.headers.set(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=120'
    );

    return response;
  } catch (error) {
    console.error('[search/suggestions]', error);
    return NextResponse.json(
      { suggestions: [], error: 'Failed to fetch suggestions' },
      { status: 500 }
    );
  }
}
