/**
 * Public surface of the SEO module.
 *
 * `@/lib/seo` used to be a single file exporting `getFirstListingPhoto`; that
 * import still resolves here, so existing call sites are untouched.
 */

export * from './photos';
export * from './urls';
export * from './jsonld';
export * from './indexability';
