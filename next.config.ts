import type { NextConfig } from 'next';

/**
 * sharp's platform package (`@img/sharp-<platform>`) is a `.node` addon that
 * dlopens libvips from a SEPARATE package (`@img/sharp-libvips-<platform>`) at
 * runtime. File tracing follows `require()` graphs, not native dynamic links, so
 * it copied the addon and left the ~18 MB shared library behind — and the
 * deployed function threw `ERR_DLOPEN_FAILED: libvips-cpp.so…: cannot open
 * shared object file` on the first `import('sharp')`. Both call sites caught it,
 * so the only symptom was photos published unprocessed and image checks quietly
 * auto-passing. Name the artifacts explicitly.
 *
 * Two path shapes because it depends on the package manager: pnpm keeps the real
 * files under `.pnpm/`, npm/yarn hoist them to `node_modules/@img/`. A glob that
 * matches nothing is ignored, so listing both is safe.
 *
 * PLATFORMS ARE NAMED ON PURPOSE. A wildcard here (`@img+sharp-libvips-*`) also
 * matches the linuxMUSL builds, which can never run on Vercel — that is 34 MB of
 * dead weight per function, and each library is ~17 MB against a 250 MB function
 * ceiling. `linux-x64` is what Vercel runs; `darwin-*` keeps local `next start`
 * honest. Deploying on a new architecture means adding it here, and the
 * `imageToolchain` probe on /api/cron/moderate-listings is what tells you.
 */
const SHARP_LIBVIPS_PLATFORMS = ['linux-x64', 'darwin-arm64', 'darwin-x64'];
const SHARP_NATIVE_LIBS = SHARP_LIBVIPS_PLATFORMS.flatMap((p) => [
  `./node_modules/.pnpm/@img+sharp-libvips-${p}@*/node_modules/@img/sharp-libvips-${p}/lib/**`,
  `./node_modules/@img/sharp-libvips-${p}/lib/**`,
]);

const nextConfig: NextConfig = {
  experimental: {
    ppr: true,
    clientSegmentCache: true,
  },
  // sharp ships prebuilt native binaries — bundling them breaks the .node
  // loading; leave it to file tracing instead.
  serverExternalPackages: ['sharp'],
  // The watermark asset lives in public/, which is served statically but is NOT
  // traced into a function's filesystem unless named here. Same for sharp's
  // libvips library — see SHARP_NATIVE_LIBS above. Every route that can reach
  // lib/images/process.ts or lib/moderation/image-check.ts needs both.
  outputFileTracingIncludes: {
    '/api/cron/moderate-listings': ['./public/brand/**', ...SHARP_NATIVE_LIBS],
    // NOT '/api/listings/[id]/moderate': these keys are matched as globs, so
    // `[id]` is read as a character class and never matches the literal segment.
    // The old bracketed key silently contributed nothing.
    '/api/listings/*/moderate': ['./public/brand/**', ...SHARP_NATIVE_LIBS],
  },
  // Headroom for the above. Tracing drags the repo's documentation into every
  // function — a 12.6 MB PDF and the screenshot set — and no route reads any of
  // it at runtime. Measured worst case per function: 196.5 MB before the sharp
  // libraries, so the ~33 MB they add leaves little room against the 250 MB
  // ceiling. The first attempt at this fix used a platform wildcard, pulled in
  // the two linuxmusl builds as well, and the deployment failed on size.
  outputFileTracingExcludes: {
    '*': ['./docs/**'],
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
