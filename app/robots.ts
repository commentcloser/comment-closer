import type { MetadataRoute } from 'next';

// Focus search-engine crawl budget on the public marketing/entry pages and keep
// private app routes and token-based flows out of the index. Path-based, so it
// is correct regardless of the production domain.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard',
        '/admin',
        '/api/',
        '/verify-email',
        '/reset-password',
        '/forgot-password',
      ],
    },
  };
}
