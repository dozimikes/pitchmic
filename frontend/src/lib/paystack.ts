import type { BillingCycle } from '@/lib/pricing';

export interface InitializePaystackCheckoutPayload {
  email: string;
  planSlug: string;
  amount: number;
  billingCycle: BillingCycle;
  metadata?: Record<string, unknown>;
}

export interface PaystackCheckoutResult {
  status: boolean;
  message: string;
  authorization_url?: string;
  access_code?: string;
  reference?: string;
}

export async function initializePaystackCheckout(
  payload: InitializePaystackCheckoutPayload
): Promise<PaystackCheckoutResult> {
  const response = await fetch('/api/payments/paystack/initialize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as PaystackCheckoutResult & { detail?: string; error?: string };

  if (!response.ok) {
    throw new Error(data.detail || data.error || data.message || 'Unable to initialize checkout.');
  }

  return data;
}

export async function verifyPaystackTransaction(reference: string) {
  const response = await fetch('/api/payments/paystack/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || data.message || 'Verification failed.');
  }

  return data;
}
