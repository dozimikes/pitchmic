/**
 * BFF register route - proxies POST /api/auth/register/ to Django,
 * then sets the same httpOnly cookies as the login route so the client
 * is fully authenticated right after sign-up.
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

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
    const rawBody = await request.json();

    // Normalize field names between frontend Zod schema and backend DRF serializer:
    //   frontend confirm_password  →  backend password_confirm
    //   frontend startup_name     →  backend startup_name (OK)
    //   frontend founder_title    →  backend founder_name (renamed)
    const {
      confirm_password,
      founder_title,
      ...rest
    } = rawBody as Record<string, unknown>;

    const body: Record<string, unknown> = { ...rest };
    if (confirm_password !== undefined) {
      body.password_confirm = confirm_password;
    }
    if (founder_title !== undefined) {
      body.founder_name = founder_title;
    }

    const resp = await fetch(`${API_BASE}/api/auth/register/`, {
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
    const cookieStore = await cookies();

    if (tokens.refresh) {
      cookieStore.set({
        ...COOKIE_HTTPONLY,
        name: 'pm_refresh',
        value: tokens.refresh,
        maxAge: 60 * 60 * 24 * 7,
      });
    }
    if (tokens.access) {
      cookieStore.set({
        ...COOKIE_BASE,
        name: 'pm_access',
        value: tokens.access,
        maxAge: 60 * 30,
      });
    }
    if (user) {
      // pm_user is readable by JS so the client can hydrate auth state
      cookieStore.set({
        ...COOKIE_BASE,
        httpOnly: false,
        name: 'pm_user',
        value: JSON.stringify(user),
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return NextResponse.json(
      { message: data.message ?? 'Registration successful', tokens, user },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { message: 'BFF register error', detail: String(err) },
      { status: 502 }
    );
  }
}
