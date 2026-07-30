import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

export function proxy(request: NextRequest) {
  const isLoginPage = request.nextUrl.pathname === '/login';
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const authenticated = verifySessionToken(token, process.env.DASHBOARD_SESSION_SECRET);

  if (!authenticated && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (authenticated && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
