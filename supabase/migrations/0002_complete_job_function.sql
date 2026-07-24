-- Completing a job must update its status AND debit the customer's hour
-- ledger atomically, otherwise a crash between the two steps could leave a
-- completed job that was never paid for in hours (or vice versa). A single
-- plpgsql function called via RPC gives us that atomicity without exposing
-- ledger writes to clients directly.

create or replace function complete_job(p_job_id uuid)
returns jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs;
begin
  select * into v_job from jobs where id = p_job_id for update;

  if v_job is null then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;

  if v_job.provider_id is distinct from auth.uid() then
    raise exception 'Only the assigned provider can complete this job' using errcode = '42501';
  end if;

  if v_job.status not in ('matched', 'in_progress') then
    raise exception 'Job cannot be completed from status %', v_job.status using errcode = '22023';
  end if;

  update jobs
  set status = 'completed', completed_at = now()
  where id = p_job_id
  returning * into v_job;

  insert into hour_ledger (user_id, job_id, amount, type, description)
  values (
    v_job.customer_id,
    v_job.id,
    -v_job.hours_required,
    'debit',
    'Hours spent on job: ' || v_job.title
  );

  return v_job;
end;
$$;

-- Callers still need to be authenticated; the function itself enforces that
-- only the assigned provider can complete their own job.
grant execute on function complete_job(uuid) to authenticated;
