import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const resp = await fetch(`${API_BASE}/api/auth/forgot-password/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: body.email }),
      signal: AbortSignal.timeout(8000),
    });

    const data = await resp.json();
    // Always return 202 to the client - mirror the backend's enumeration-safe design.
    // Even if the backend 400s (bad email format), we return 202 so the client
    // cannot distinguish "email not found" from "email found, email queued".
    return NextResponse.json(
      { message: data.message ?? 'If that account exists, a reset link has been sent.' },
      { status: 202 },
    );
  } catch (err) {
    return NextResponse.json(
      { message: 'Unable to process request. Please try again.' },
      { status: 502 },
    );
  }
}
