'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const PLANS = [
  { name: 'Starter', hours: 5, price: '$99/mo', priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER },
  { name: 'Plus', hours: 10, price: '$179/mo', priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PLUS },
  { name: 'Pro', hours: 20, price: '$329/mo', priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO },
] as const;

export default function SubscriptionButton({ userId }: { userId: string }) {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subscribe = async (plan: (typeof PLANS)[number]) => {
    if (!plan.priceId) {
      setError(`Missing Stripe price ID for ${plan.name} — set NEXT_PUBLIC_STRIPE_PRICE_${plan.name.toUpperCase()}`);
      return;
    }

    setLoadingPlan(plan.name);
    setError(null);

    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke('create-checkout', {
      body: { userId, priceId: plan.priceId, planName: plan.name, hours: plan.hours },
    });

    setLoadingPlan(null);

    if (error || !data?.url) {
      setError(error?.message ?? 'Could not start checkout');
      return;
    }

    window.location.href = data.url;
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {PLANS.map((plan) => (
        <button
          key={plan.name}
          onClick={() => subscribe(plan)}
          disabled={loadingPlan !== null}
          className="rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-brand-400 disabled:opacity-50"
        >
          <p className="text-sm font-semibold text-gray-900">{plan.name}</p>
          <p className="text-xs text-gray-500">{plan.hours}h / month</p>
          <p className="mt-2 text-lg font-bold text-brand-600">{plan.price}</p>
          <p className="mt-2 text-xs font-medium text-brand-600">
            {loadingPlan === plan.name ? 'Redirecting…' : 'Choose plan →'}
          </p>
        </button>
      ))}
      {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
    </div>
  );
}
