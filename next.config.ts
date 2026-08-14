import type { NextConfig } from 'next';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

/**
 * sharp's platform package (`@img/sharp-<platform>-<arch>`) is a `.node` addon
 * that dlopens libvips from a SEPARATE package (`@img/sharp-libvips-…`) at
 * runtime. File tracing follows `require()` graphs, not native dynamic links, so
 * it copied the addon and left the ~17 MB shared library behind — and the
 * deployed function threw `ERR_DLOPEN_FAILED: libvips-cpp.so…: cannot open
 * shared object file` on the first `import('sharp')`. Both call sites caught it,
 * so the only symptom was photos published unprocessed and image checks quietly
 * auto-passing.
 *
 * The library therefore has to be named in `outputFileTracingIncludes` — but as
 * EXACT EXISTING FILE PATHS, resolved here at build time the same way sharp
 * resolves them at runtime. DO NOT REACH FOR GLOBS. A wildcard include over the
 * `@img` packages builds fine locally and on Linux, then fails the Vercel
 * deployment; bisected against real deployments, a precise path for the very
 * same library succeeds. Resolving instead of globbing also means no version
 * pins to go stale, no package-manager-specific layout, and none of the
 * linuxmusl builds that can never run on Vercel.
 *
 * Returns [] if nothing resolves, which keeps the build working — the
 * `imageToolchain` probe on /api/cron/moderate-listings is what tells you the
 * deployed function came out without it.
 */
function sharpNativeLibs(): string[] {
  const req = createRequire(import.meta.url);
  const tryResolve = (spec: string, from?: string) => {
    try {
      return req.resolve(spec, from ? { paths: [from] } : undefined);
    } catch {
      return null;
    }
  };
  // Resolve ENTRY POINTS, never `<pkg>/package.json` — sharp's `exports` map does
  // not expose it, so asking for it throws ERR_PACKAGE_PATH_NOT_EXPORTED and this
  // whole function would quietly return [].
  const pkgRootOf = (file: string): string | null => {
    let dir = path.dirname(file);
    while (dir !== path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
      dir = path.dirname(dir);
    }
    return null;
  };

  const sharpEntry = tryResolve('sharp');
  const sharpDir = sharpEntry && pkgRootOf(sharpEntry);
  if (!sharpDir) return [];

  // Plain platform first: on a glibc host the musl package is not installed, and
  // whichever one resolves is the one sharp itself will load.
  for (const suffix of [
    `${process.platform}-${process.arch}`,
    `${process.platform}musl-${process.arch}`,
  ]) {
    const addon = tryResolve(`@img/sharp-${suffix}/sharp.node`, sharpDir);
    const addonDir = addon && pkgRootOf(addon);
    if (!addonDir) continue;
    const vipsEntry = tryResolve(`@img/sharp-libvips-${suffix}/lib`, addonDir);
    if (!vipsEntry) continue;

    // Only the shared library itself: `lib/index.js` and the manifest already
    // come through the require graph, and the bundled glib headers are
    // build-time artifacts nothing dlopens.
    const libDir = path.dirname(vipsEntry);
    return fs
      .readdirSync(libDir)
      .filter((f) => f.startsWith('libvips-cpp'))
      .map((f) => `./${path.relative(process.cwd(), path.join(libDir, f))}`);
  }
  return [];
}

const SHARP_NATIVE_LIBS = sharpNativeLibs();

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
  // Tracing drags the repo's documentation into every function — a 12.6 MB PDF
  // and the screenshot set — and no route reads any of it at runtime. Worth
  // reclaiming: a function measured 196.5 MB before the ~17 MB library, against
  // a 250 MB ceiling.
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
  async redirects() {
    return [
      {
        // The 60-second form used to live on its own route. It is now a mode of
        // the single create-listing page; this keeps old links and bookmarks
        // (and the sign-in/sign-up `redirect` funnel) landing on the quick form.
        source: '/dashboard/listings/quick-new',
        destination: '/dashboard/listings/new?mode=quick',
        permanent: true,
      },
    ];
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
