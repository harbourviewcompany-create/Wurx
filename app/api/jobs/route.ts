import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // RLS already scopes this to the caller's own jobs (customer) or
  // assigned/open jobs (provider) - no need to filter manually here.
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(jobs);
}

const SERVICE_TYPES = ['cleaning', 'snow_removal', 'landscaping', 'handyman'];

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json();
  const { title, description, serviceType, hoursRequired, address, lat, lng, scheduledAt } = body;

  if (!title || !serviceType || !hoursRequired) {
    return NextResponse.json(
      { error: 'title, serviceType, and hoursRequired are required' },
      { status: 400 }
    );
  }

  if (!SERVICE_TYPES.includes(serviceType)) {
    return NextResponse.json({ error: `serviceType must be one of ${SERVICE_TYPES.join(', ')}` }, { status: 400 });
  }

  if (typeof hoursRequired !== 'number' || hoursRequired <= 0) {
    return NextResponse.json({ error: 'hoursRequired must be a positive number' }, { status: 400 });
  }

  // Make sure the customer has enough hour credits before letting them book.
  const { data: balanceRow, error: balanceError } = await supabase
    .from('hour_balances')
    .select('balance')
    .eq('user_id', user.id)
    .maybeSingle();

  if (balanceError) {
    return NextResponse.json({ error: balanceError.message }, { status: 500 });
  }

  const balance = balanceRow?.balance ?? 0;
  if (balance < hoursRequired) {
    return NextResponse.json(
      { error: `Not enough hour credits. Balance: ${balance}, needed: ${hoursRequired}` },
      { status: 402 }
    );
  }

  const { data: job, error } = await supabase
    .from('jobs')
    .insert({
      customer_id: user.id,
      title,
      description,
      service_type: serviceType,
      hours_required: hoursRequired,
      address,
      lat,
      lng,
      scheduled_at: scheduledAt,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(job, { status: 201 });
}
