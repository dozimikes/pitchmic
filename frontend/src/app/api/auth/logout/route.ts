import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

async function handleLogout(): Promise<NextResponse> {
  try {
    const refresh = cookies().get('pm_refresh')?.value;
    if (refresh) {
      try {
        await fetch(`${API_BASE}/api/auth/token/verify/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: refresh }),
        });
      } catch { /* ignore */ }
    }
    cookies().delete('pm_access');
    cookies().delete('pm_refresh');
    cookies().delete('pm_user');
    return NextResponse.json({ message: 'Logged out' });
  } catch (err) {
    return NextResponse.json({ detail: String(err) }, { status: 500 });
  }
}

export async function POST(): Promise<NextResponse> {
  return handleLogout();
}

export async function GET(): Promise<NextResponse> {
  return handleLogout();
}
