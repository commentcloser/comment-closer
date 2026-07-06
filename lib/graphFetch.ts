/**
 * Meta Graph API fetch that keeps the access token OUT of the request URL
 * (query strings leak into Vercel/CDN/proxy access logs and Referer headers).
 *
 * Call sites can keep building the same `...&access_token=${token}` URL they
 * always did — this helper strips the access_token query param and sends it as
 * an `Authorization: Bearer` header instead, which Meta's Graph API accepts.
 * A token passed explicitly as the 2nd arg takes precedence. (SEC-8)
 */
export function graphFetch(url: string, accessToken?: string, init?: RequestInit): Promise<Response> {
  let cleanUrl = url;
  let token = accessToken;

  try {
    const u = new URL(url);
    const urlToken = u.searchParams.get('access_token');
    if (urlToken) {
      token = token || urlToken;
      u.searchParams.delete('access_token');
      cleanUrl = u.toString();
    }
  } catch {
    // Not an absolute URL we can parse; leave it untouched.
  }

  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(cleanUrl, { ...init, headers });
}
