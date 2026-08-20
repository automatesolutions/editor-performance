import { type NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

/**
 * Gate every page behind the shared password.
 *
 * The cron routes are excluded here because they authenticate with
 * CRON_SECRET instead — a scheduler cannot present a session cookie.
 */
export async function middleware(request: NextRequest) {
  const secret = process.env.SESSION_SECRET;

  // Fail closed: without a signing secret no session can be verified, so
  // serving the dashboard would mean serving it unauthenticated.
  if (!secret) {
    return new NextResponse('SESSION_SECRET is not configured.', { status: 500 });
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && (await verifySessionToken(token, secret))) {
    return NextResponse.next();
  }

  const url = new URL('/login', request.url);
  // Preserve where they were heading so login can send them back.
  if (request.nextUrl.pathname !== '/') {
    url.searchParams.set('next', request.nextUrl.pathname);
  }
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *   - /login and the login API (or there would be no way in)
     *   - /api/cron/* (CRON_SECRET-authenticated)
     *   - Next.js internals and static assets
     */
    '/((?!login|api/auth|api/cron|_next/static|_next/image|favicon.ico).*)',
  ],
};
