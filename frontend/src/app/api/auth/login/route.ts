import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';
const PROD = process.env.NODE_ENV === 'production';

const COOKIE_BASE = {
  httpOnly: false, // must be readable by js-cookie for Authorization header injection
  secure: PROD,
  sameSite: 'lax' as const,
  path: '/',
};

const COOKIE_HTTPONLY = {
  httpOnly: true, // server-only cookies (refresh token)
  secure: PROD,
  sameSite: 'lax' as const,
  path: '/',
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const resp = await fetch(`${API_BASE}/api/auth/login/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return NextResponse.json(data, { status: resp.status });
    }

    const tokens = data.tokens ?? {};
    const user = data.user;
    if (tokens.refresh) {
      cookies().set({
        ...COOKIE_HTTPONLY,
        name: 'pm_refresh',
        value: tokens.refresh,
        maxAge: 60 * 60 * 24 * 7,
      });
    }
    if (tokens.access) {
      cookies().set({
        ...COOKIE_BASE,
        name: 'pm_access',
        value: tokens.access,
        maxAge: 60 * 30,
      });
    }
    if (user) {
      cookies().set({
        ...COOKIE_BASE,
        httpOnly: false,
        name: 'pm_user',
        value: JSON.stringify(user),
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return NextResponse.json({ message: data.message ?? 'OK', tokens, user });
  } catch (err) {
    return NextResponse.json(
      { message: 'BFF login error', detail: String(err) },
      { status: 502 }
    );
  }
}
