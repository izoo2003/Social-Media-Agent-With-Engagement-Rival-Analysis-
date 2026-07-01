import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const CREATION_HOME = '/dashboard/creation';
const TIER_COOKIE = 'dashboard_tier';

const JUNIOR_ALLOWED_PREFIXES = ['/dashboard/creation', '/dashboard/generator'];

function isCreationOnlyDashboardPath(pathname: string): boolean {
  return pathname === CREATION_HOME || pathname.startsWith(`${CREATION_HOME}/`);
}

function isJuniorDashboardPath(pathname: string): boolean {
  return JUNIOR_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function tierFromRequest(request: NextRequest): string | undefined {
  return request.cookies.get(TIER_COOKIE)?.value;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const session = request.cookies.get('dashboard_session');
  if (!session?.value) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (process.env.NEXT_PUBLIC_APP_MODE === 'creation-only' && pathname.startsWith('/dashboard')) {
    if (pathname === '/dashboard') {
      return NextResponse.redirect(new URL(CREATION_HOME, request.url));
    }
    if (!isCreationOnlyDashboardPath(pathname)) {
      return NextResponse.redirect(new URL(CREATION_HOME, request.url));
    }
  } else if (tierFromRequest(request) === 'junior' && pathname.startsWith('/dashboard')) {
    if (pathname === '/dashboard') {
      return NextResponse.redirect(new URL(CREATION_HOME, request.url));
    }
    if (!isJuniorDashboardPath(pathname)) {
      return NextResponse.redirect(new URL(CREATION_HOME, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*'],
};
