-- Retain the normalized graph payload so a failed graph synchronization can be
-- retried without re-running the local REA analysis.

alter table public.graph_sync
  add column if not exists graph_payload jsonb;

drop function if exists public.finalize_job(
  uuid, uuid, uuid, text, text, text, jsonb, jsonb, text, text, bigint
);

create or replace function public.finalize_job(
  p_job_id uuid,
  p_owner_id uuid,
  p_companion_id uuid,
  p_status text,
  p_error_code text,
  p_error_message text,
  p_summary jsonb,
  p_findings jsonb,
  p_artifact_path text,
  p_artifact_sha256 text,
  p_artifact_size bigint,
  p_graph jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.analysis_jobs;
  v_count integer := 0;
begin
  if p_status not in ('succeeded', 'failed') then
    raise exception 'invalid_job_status' using errcode = 'P0001';
  end if;

  select * into v_job
  from public.analysis_jobs
  where id = p_job_id
    and owner_id = p_owner_id
    and companion_id = p_companion_id
  for update;

  if not found then
    raise exception 'job_not_found' using errcode = 'P0001';
  end if;

  if v_job.status not in ('claimed', 'running') then
    raise exception 'job_not_open' using errcode = 'P0001';
  end if;

  if p_artifact_path is not null then
    insert into public.analysis_artifacts (
      job_id, project_id, owner_id, storage_path, sha256, size_bytes
    )
    values (
      v_job.id, v_job.project_id, v_job.owner_id,
      p_artifact_path, p_artifact_sha256, p_artifact_size
    )
    on conflict (storage_path) do nothing;
  end if;

  update public.analysis_jobs
  set status = p_status::public.job_status,
      progress = case when p_status = 'succeeded' then 100 else progress end,
      error_code = p_error_code,
      error_message = p_error_message,
      result_summary = p_summary,
      finished_at = now(),
      lease_expires_at = null
  where id = p_job_id;

  if p_status = 'succeeded' and p_findings is not null then
    insert into public.findings (
      job_id, project_id, owner_id, class, category, title, detail, confidence, evidence
    )
    select
      v_job.id,
      v_job.project_id,
      v_job.owner_id,
      coalesce((f ->> 'class')::public.finding_class, 'observed'::public.finding_class),
      f ->> 'category',
      f ->> 'title',
      f ->> 'detail',
      (f ->> 'confidence')::numeric,
      coalesce(f -> 'evidence', '[]'::jsonb)
    from jsonb_array_elements(p_findings) as f
    where f ->> 'title' is not null;

    get diagnostics v_count = row_count;

    insert into public.graph_sync (job_id, project_id, owner_id, status, graph_payload)
    values (v_job.id, v_job.project_id, v_job.owner_id, 'pending', p_graph)
    on conflict (job_id) do update
      set status = 'pending',
          graph_payload = excluded.graph_payload,
          error_message = null;
  end if;

  return jsonb_build_object(
    'job_id', v_job.id,
    'status', p_status,
    'findings_inserted', v_count
  );
end;
$$;

revoke all on function public.finalize_job(
  uuid, uuid, uuid, text, text, text, jsonb, jsonb, text, text, bigint, jsonb
) from public, anon, authenticated;
grant execute on function public.finalize_job(
  uuid, uuid, uuid, text, text, text, jsonb, jsonb, text, text, bigint, jsonb
) to service_role;
