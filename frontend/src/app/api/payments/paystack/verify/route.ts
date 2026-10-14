import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_URL = 'https://api.paystack.co';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const reference = String(body.reference || '').trim();

    if (!PAYSTACK_SECRET_KEY) {
      return NextResponse.json(
        {
          status: false,
          message: 'Paystack secret key is not configured. Add PAYSTACK_SECRET_KEY to your environment.',
        },
        { status: 503 }
      );
    }

    if (!reference) {
      return NextResponse.json(
        {
          status: false,
          message: 'Missing payment reference.',
        },
        { status: 400 }
      );
    }

    const response = await fetch(`${PAYSTACK_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        Accept: 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          status: false,
          message: data.message || 'Unable to verify payment.',
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      status: data.data?.status === 'success',
      message: data.data?.status === 'success' ? 'Payment verified successfully.' : 'Payment was not successful.',
      verification: data.data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Verification failed.',
      },
      { status: 500 }
    );
  }
}
