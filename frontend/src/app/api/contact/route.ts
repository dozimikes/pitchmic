import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, role, topic, organization, subject, message, isConfidential } = body || {};

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json({ error: 'Please provide your full name.' }, { status: 400 });
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Please provide a valid email address.' }, { status: 400 });
    }

    if (!message || typeof message !== 'string' || message.trim().length < 10) {
      return NextResponse.json({ error: 'Message must be at least 10 characters long.' }, { status: 400 });
    }

    const ticketId = `PM-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const receivedAt = new Date().toISOString();

    // Log the inquiry for operational tracking
    console.log('[Pitchmic Contact API]', {
      ticketId,
      receivedAt,
      name: name.trim(),
      email: email.trim(),
      role: role || 'unspecified',
      topic: topic || 'general',
      organization: organization || 'N/A',
      subject: subject || 'General Inquiry',
      isConfidential: Boolean(isConfidential),
    });

    return NextResponse.json({
      success: true,
      ticketId,
      receivedAt,
      message: 'Your inquiry has been received. Our team will review and respond within 12–24 business hours.',
    });
  } catch (error) {
    console.error('[Pitchmic Contact API Error]', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while submitting your message. Please try again.' },
      { status: 500 }
    );
  }
}
