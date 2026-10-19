-- Trigger functions are not API endpoints. Remove default EXECUTE grants and
-- add covering indexes for foreign keys used by ownership-scoped queries.

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

create index if not exists ai_runs_owner_idx
  on public.ai_runs (owner_id);
create index if not exists analysis_artifacts_owner_idx
  on public.analysis_artifacts (owner_id);
create index if not exists analysis_artifacts_project_idx
  on public.analysis_artifacts (project_id);
create index if not exists analysis_jobs_target_idx
  on public.analysis_jobs (target_id);
create index if not exists findings_owner_idx
  on public.findings (owner_id);
create index if not exists graph_sync_owner_idx
  on public.graph_sync (owner_id);
create index if not exists pairing_codes_owner_idx
  on public.pairing_codes (owner_id);
