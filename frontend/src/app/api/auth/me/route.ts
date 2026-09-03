export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth) {
    return NextResponse.json({ detail: 'No authorization header.' }, { status: 401 });
  }

  try {
    const upstream = await fetch(`${API_BASE}/me/`, {
      headers: {
        Authorization: auth,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ detail: 'Upstream error.' }, { status: 502 });
  }
}
