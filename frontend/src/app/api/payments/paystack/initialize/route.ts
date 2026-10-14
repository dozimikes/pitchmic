import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_URL = 'https://api.paystack.co';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const planSlug = String(body.planSlug || '');
    const email = String(body.email || '');
    const billingCycle = String(body.billingCycle || 'monthly');
    const amount = Number(body.amount || 0);

    if (!PAYSTACK_SECRET_KEY) {
      return NextResponse.json(
        {
          status: false,
          message: 'Paystack secret key is not configured. Add PAYSTACK_SECRET_KEY to your environment.',
        },
        { status: 503 }
      );
    }

    if (!email || !amount || !planSlug) {
      return NextResponse.json(
        {
          status: false,
          message: 'Missing required payment details. Please choose a plan and sign in again.',
        },
        { status: 400 }
      );
    }

    const response = await fetch(`${PAYSTACK_URL}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: Math.round(amount),
        currency: 'USD',
        callback_url: `${process.env.NEXT_PUBLIC_BFF_BASE_URL || 'http://localhost:3000'}/upgrade?checkout=success`,
        metadata: {
          plan_slug: planSlug,
          billing_cycle: billingCycle,
          source: 'pitchmic_upgrade_page',
          ...body.metadata,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          status: false,
          message: data.message || 'Unable to initialize Paystack checkout.',
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      status: true,
      message: 'Checkout initialized successfully.',
      authorization_url: data.data?.authorization_url,
      access_code: data.data?.access_code,
      reference: data.data?.reference,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Checkout initialization failed.',
      },
      { status: 500 }
    );
  }
}
