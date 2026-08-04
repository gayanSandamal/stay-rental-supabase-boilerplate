import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://easyrent.lk';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // /l/ holds passwordless access links — never index or follow them.
        disallow: ['/dashboard/', '/back-office/', '/api/', '/l/', '/link-expired'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
