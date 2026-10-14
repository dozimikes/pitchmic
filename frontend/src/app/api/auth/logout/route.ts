import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

async function handleLogout(): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const refresh = cookieStore.get('pm_refresh')?.value;
    if (refresh) {
      try {
        await fetch(`${API_BASE}/api/auth/token/verify/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: refresh }),
        });
      } catch { /* ignore */ }
    }
    cookieStore.delete('pm_access');
    cookieStore.delete('pm_refresh');
    cookieStore.delete('pm_user');
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
