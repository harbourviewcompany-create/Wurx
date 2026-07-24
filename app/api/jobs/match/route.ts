import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { scoreProvidersForJob } from '@/lib/matching';

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { jobId } = await req.json();
  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
  }

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  if (job.customer_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized to match this job' }, { status: 403 });
  }

  if (job.status !== 'pending') {
    return NextResponse.json({ error: `Job is already ${job.status}` }, { status: 409 });
  }

  const candidates = await scoreProvidersForJob(supabase, job);

  if (candidates.length === 0) {
    return NextResponse.json({ matched: false, reason: 'No available providers found nearby' });
  }

  const best = candidates[0];

  const { data: updatedJob, error: updateError } = await supabase
    .from('jobs')
    .update({
      provider_id: best.providerId,
      status: 'matched',
      matched_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('status', 'pending') // guards against a race with another match request
    .select()
    .single();

  if (updateError || !updatedJob) {
    return NextResponse.json({ error: updateError?.message ?? 'Job was matched by another request' }, { status: 409 });
  }

  return NextResponse.json({
    matched: true,
    job: updatedJob,
    candidateCount: candidates.length,
    score: best.score,
  });
}
