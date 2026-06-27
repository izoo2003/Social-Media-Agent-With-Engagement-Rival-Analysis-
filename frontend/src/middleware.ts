import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const CREATION_HOME = '/dashboard/creation';
const TIER_COOKIE = 'dashboard_tier';

function isCreationOnlyDashboardPath(pathname: string): boolean {
  return pathname === CREATION_HOME || pathname.startsWith(`${CREATION_HOME}/`);
}

function resolveCreationOnly(request: NextRequest): boolean {
  if (process.env.NEXT_PUBLIC_APP_MODE === 'creation-only') {
    return true;
  }
  return request.cookies.get(TIER_COOKIE)?.value === 'junior';
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const session = request.cookies.get('dashboard_session');
  if (!session?.value) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (resolveCreationOnly(request) && pathname.startsWith('/dashboard')) {
    if (pathname === '/dashboard') {
      return NextResponse.redirect(new URL(CREATION_HOME, request.url));
    }
    if (!isCreationOnlyDashboardPath(pathname)) {
      return NextResponse.redirect(new URL(CREATION_HOME, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*'],
};
