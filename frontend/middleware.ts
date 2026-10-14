import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|images|logo.png|icon.png).*)',
  ],
};

const DJANGO_ADMIN_URL =
  process.env.NEXT_PUBLIC_DJANGO_ADMIN_URL ||
  'http://127.0.0.1:8000/pitchmic-control-portal-hq-8492/';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Intercept /admin attempts on frontend port 3000 and redirect to secure Django admin
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const subpath = pathname.replace(/^\/admin\/?/, '');
    const redirectUrl = new URL(subpath, DJANGO_ADMIN_URL).toString();
    return NextResponse.redirect(redirectUrl, 307);
  }

  return NextResponse.next();
}
