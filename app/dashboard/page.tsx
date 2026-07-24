import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import CreateJobForm from '@/app/components/CreateJobForm';
import SubscriptionButton from '@/app/components/SubscriptionButton';
import JobCard from '@/app/components/JobCard';
import SignOutButton from '@/app/components/SignOutButton';

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [{ data: profile }, { data: balanceRow }, { data: jobs }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('hour_balances').select('balance').eq('user_id', user.id).maybeSingle(),
    supabase.from('jobs').select('*').order('created_at', { ascending: false }),
  ]);

  const hourBalance = balanceRow?.balance ?? 0;
  const isCustomer = profile?.role === 'customer';

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-16 pt-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Hi{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-sm text-gray-500">
            {isCustomer ? `${hourBalance}h available` : 'Provider dashboard'}
          </p>
        </div>
        <SignOutButton />
      </div>

      {isCustomer && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Subscription plans</h2>
          <SubscriptionButton userId={user.id} />
        </section>
      )}

      {isCustomer && (
        <section className="mt-6">
          <CreateJobForm hourBalance={hourBalance} />
        </section>
      )}

      <section className="mt-6 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">
          {isCustomer ? 'Your bookings' : 'Assigned & open jobs'}
        </h2>
        {!jobs || jobs.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing here yet.</p>
        ) : (
          jobs.map((job) => <JobCard key={job.id} job={job} currentUserId={user.id} />)
        )}
      </section>
    </main>
  );
}
