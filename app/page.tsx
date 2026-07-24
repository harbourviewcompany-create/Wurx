import Link from 'next/link';

const SERVICES = [
  { label: 'Cleaning', emoji: '🧹' },
  { label: 'Snow removal', emoji: '❄️' },
  { label: 'Landscaping', emoji: '🌱' },
  { label: 'Handyman', emoji: '🔧' },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <span className="text-lg font-bold text-brand-600">Wurx</span>
        <Link href="/login" className="text-sm font-medium text-gray-600">
          Log in
        </Link>
      </header>

      <section className="mt-12">
        <h1 className="text-3xl font-bold leading-tight text-gray-900">
          Home services, on subscription.
        </h1>
        <p className="mt-3 text-base text-gray-600">
          Get monthly hour credits and book trusted local pros for cleaning, snow removal,
          landscaping, and handyman work — all in one app.
        </p>
        <Link
          href="/signup"
          className="mt-6 block w-full rounded-lg bg-brand-600 px-4 py-3 text-center text-base font-medium text-white hover:bg-brand-700"
        >
          Get started
        </Link>
      </section>

      <section className="mt-12 grid grid-cols-2 gap-3">
        {SERVICES.map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-4 text-center shadow-sm">
            <span className="text-2xl">{s.emoji}</span>
            <p className="mt-2 text-sm font-medium text-gray-800">{s.label}</p>
          </div>
        ))}
      </section>

      <section className="mt-12">
        <h2 className="text-sm font-semibold text-gray-700">How it works</h2>
        <ol className="mt-3 space-y-3 text-sm text-gray-600">
          <li>1. Pick a monthly plan and get hour credits.</li>
          <li>2. Book a job — we match you with an available local provider.</li>
          <li>3. Provider completes the job, hours are deducted automatically.</li>
        </ol>
      </section>

      <footer className="mt-auto pt-12 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} Wurx
      </footer>
    </main>
  );
}
