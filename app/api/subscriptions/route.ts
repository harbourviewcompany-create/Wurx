import { NextResponse } from 'next/server';
import { createCheckoutSession } from '@/lib/stripe';

export async function POST(req: Request) {
  const { email, priceId } = await req.json();

  if (!email || !priceId) {
    return NextResponse.json(
      { error: 'email and priceId are required' },
      { status: 400 }
    );
  }

  const session = await createCheckoutSession(email, priceId);

  return NextResponse.json({ url: session.url });
}