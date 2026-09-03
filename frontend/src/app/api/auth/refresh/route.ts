import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';
const PROD = process.env.NODE_ENV === 'production';

export async function POST(request: Request) {
  try {
    const existingRefresh = cookies().get('pm_refresh')?.value;
    let refresh: string | undefined = existingRefresh;
    try {
      const body = await request.json();
      if (body?.refresh) refresh = body.refresh;
    } catch { /* ignore — use cookie only */ }
    if (!refresh) {
      return NextResponse.json({ detail: 'No refresh token' }, { status: 401 });
    }

    const resp = await fetch(`${API_BASE}/api/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refresh }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return NextResponse.json(data, { status: resp.status });
    }

    if (data.access) {
      cookies().set({
        httpOnly: false, // must be readable by js-cookie for Authorization header injection
        secure: PROD,
        sameSite: 'lax',
        path: '/',
        name: 'pm_access',
        value: data.access,
        maxAge: 60 * 30,
      });
    }
    if (data.refresh) {
      cookies().set({
        httpOnly: true, // server-only
        secure: PROD,
        sameSite: 'lax',
        path: '/',
        name: 'pm_refresh',
        value: data.refresh,
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ detail: String(err) }, { status: 502 });
  }
}
