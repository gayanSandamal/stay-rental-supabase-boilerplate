import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    ppr: true,
    clientSegmentCache: true,
  },
  // sharp ships prebuilt native binaries — bundling them breaks the .node
  // loading; leave it to file tracing instead.
  serverExternalPackages: ['sharp'],
  // The watermark asset lives in public/, which is served statically but is NOT
  // traced into a function's filesystem unless named here.
  outputFileTracingIncludes: {
    '/api/cron/moderate-listings': ['./public/brand/**'],
    '/api/listings/[id]/moderate': ['./public/brand/**'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.in',
      },
    ],
  },
  async headers() {
    // Baseline security headers. NOTE: a full Content-Security-Policy is
    // intentionally omitted — it needs its own testing pass to avoid breaking
    // Next/Supabase inline scripts. `frame-ancestors 'none'` covers clickjacking.
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self), browsing-topics=()',
          },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'",
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
