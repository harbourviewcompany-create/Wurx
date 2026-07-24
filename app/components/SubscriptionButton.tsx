'use client';

export default function SubscriptionButton() {
  const subscribe = async () => {
    const res = await fetch('/api/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com' })
    });

    const data = await res.json();
    window.location.href = data.url;
  };

  return <button onClick={subscribe}>Subscribe</button>;
}