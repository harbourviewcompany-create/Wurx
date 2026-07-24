import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

export async function createCheckoutSession(customerEmail: string) {
  return await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'subscription',
    customer_email: customerEmail,
    line_items: [
      {
        price: process.env.STRIPE_PRICE_ID!,
        quantity: 1,
      },
    ],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/cancel`,
  });
}