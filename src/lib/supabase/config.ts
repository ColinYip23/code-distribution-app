/** Supabase SDKs require the project origin, rather than a copied REST endpoint. */
export function normalizeSupabaseUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.username || url.password || url.search || url.hash || !['/', '/rest/v1', '/rest/v1/', ''].includes(url.pathname)) throw new Error('Use the Supabase project URL or REST endpoint.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Use an HTTPS Supabase project URL.');
  return url.origin;
}
