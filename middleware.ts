import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * Server-side route guard (SEC-4).
 *
 * /dashboard and /admin were previously protected only by client-side
 * useSession()/router.replace effects, so the page shells (and any inlined
 * data) still rendered for an unauthenticated visitor who ignored the
 * redirect or scraped the RSC/JS payload. This middleware verifies the
 * NextAuth JWT session at the edge before the route is served.
 *
 * Session strategy is 'jwt' (lib/auth.ts), so getToken can validate the
 * signed cookie without touching Prisma — keeping this edge-compatible.
 */

const secret = process.env.NEXTAUTH_SECRET;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Auth.js salts the encrypted session JWT with the cookie name and uses the
  // __Secure- prefix on HTTPS, so both must be passed for getToken to decrypt.
  const isSecure =
    request.nextUrl.protocol === 'https:' || process.env.NODE_ENV === 'production';
  const cookieName = isSecure
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token';

  const token = await getToken({
    req: request,
    secret,
    secureCookie: isSecure,
    cookieName,
    salt: cookieName,
  });

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // /admin additionally requires the ADMIN role.
  if (pathname.startsWith('/admin') && (token as { role?: string }).role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*'],
};
