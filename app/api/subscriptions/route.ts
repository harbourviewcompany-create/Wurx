import { NextResponse } from 'next/server';
import { createCheckoutSession } from '@/lib/stripe';

export async function POST(req: Request) {
  const { email } = await req.json();

  const session = await createCheckoutSession(email);

  return NextResponse.json({ url: session.url });
}