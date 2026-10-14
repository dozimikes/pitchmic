import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const resp = await fetch(`${API_BASE}/api/auth/reset-password/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        token: body.token,
        password: body.password,
        password_confirm: body.password_confirm,
      }),
      signal: AbortSignal.timeout(8000),
    });

    const data = await resp.json();

    if (!resp.ok) {
      // Surface the first error message from the backend (e.g. "token expired")
      const detail =
        data?.token?.[0] ??
        data?.password?.[0] ??
        data?.non_field_errors?.[0] ??
        data?.detail ??
        data?.message ??
        'Password reset failed. Please try again.';
      return NextResponse.json({ message: detail }, { status: resp.status });
    }

    return NextResponse.json(
      { message: data.message ?? 'Password reset successfully.' },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      { message: 'Unable to process request. Please try again.' },
      { status: 502 },
    );
  }
}
