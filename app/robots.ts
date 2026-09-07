import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo/urls';

/**
 * ── Cloudflare gets the first word, and we cannot override it ──────────────
 * Production sits behind Cloudflare, which PREPENDS its own managed block to
 * whatever this file returns. Measured on the live site 2026-09-07, that block
 * set `Content-Signal: search=yes,ai-train=no,use=reference` and a flat
 * `Disallow: /` for GPTBot, ClaudeBot, Google-Extended, CCBot, Bytespider,
 * meta-externalagent, Amazonbot and Applebot-Extended. Googlebot and Bingbot
 * were never affected, so classic search worked the whole time — but the site
 * was invisible to every AI answer engine.
 *
 * That is a Cloudflare dashboard setting (AI Crawl Control → Manage robots.txt)
 * and CANNOT be changed from this repo. If the live /robots.txt still contains
 * `# BEGIN Cloudflare Managed content`, turning the groups below into actual
 * permission is a dashboard task, not a code one.
 *
 * The explicit per-bot groups are still worth having. Robots.txt matching picks
 * the most specific group for a user-agent, and where rules tie on path length
 * Google's parser resolves in favour of Allow — so these state our intent
 * unambiguously, and they take effect the moment the managed block is removed.
 *
 * ── Why the disallows below stay ──────────────────────────────────────────
 * `/l/` holds passwordless landlord access links. Indexing one would publish a
 * working login URL, so it is a security control rather than an SEO choice —
 * `app/l/[...slug]/route.ts` also sets `X-Robots-Tag: noindex` for the crawlers
 * that ignore robots.txt.
 */

/** Crawlers explicitly welcomed. Both AI-search retrieval bots and training bots. */
const WELCOME_AGENTS = [
  // Classic search
  'Googlebot',
  'Bingbot',
  // AI search / retrieval — these are what produce citations and referral traffic
  'OAI-SearchBot',
  'ChatGPT-User',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  // Training crawlers
  'GPTBot',
  'ClaudeBot',
  'CCBot',
  'Google-Extended',
  'Applebot-Extended',
  'meta-externalagent',
];

const DISALLOW = ['/dashboard/', '/back-office/', '/api/', '/l/', '/link-expired'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: DISALLOW,
      },
      ...WELCOME_AGENTS.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow: DISALLOW,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
