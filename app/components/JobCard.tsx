'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Job } from '@/lib/supabase/types';

const STATUS_STYLES: Record<Job['status'], string> = {
  pending: 'bg-amber-100 text-amber-800',
  matched: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

export default function JobCard({
  job,
  currentUserId,
}: {
  job: Job;
  currentUserId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustomer = job.customer_id === currentUserId;
  const isProvider = job.provider_id === currentUserId;

  const runAction = async (path: string) => {
    setLoading(true);
    setError(null);
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.id }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Action failed');
      return;
    }
    router.refresh();
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{job.title}</h3>
          <p className="text-xs capitalize text-gray-500">
            {job.service_type.replace('_', ' ')} · {job.hours_required}h
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[job.status]}`}>
          {job.status.replace('_', ' ')}
        </span>
      </div>

      {job.description && <p className="mt-2 text-sm text-gray-600">{job.description}</p>}
      {job.address && <p className="mt-1 text-xs text-gray-400">{job.address}</p>}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 flex gap-2">
        {isCustomer && job.status === 'pending' && (
          <button
            disabled={loading}
            onClick={() => runAction('/api/jobs/match')}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? 'Matching…' : 'Find a provider'}
          </button>
        )}

        {isProvider && (job.status === 'matched' || job.status === 'in_progress') && (
          <button
            disabled={loading}
            onClick={() => runAction('/api/jobs/complete')}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Completing…' : 'Mark complete'}
          </button>
        )}
      </div>
    </div>
  );
}
