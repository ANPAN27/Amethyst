import "server-only";

import { ApiError } from "@/lib/api/errors";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { CompanionRow } from "@/lib/services/companions";

export type CompanionJob = {
  id: string;
  project_id: string;
  owner_id: string;
  workflow: string;
  params: Record<string, unknown>;
  status: string;
  progress: number;
  target_id: string | null;
  created_at: string;
  started_at: string | null;
};

export async function getCompanionJob(
  companion: CompanionRow,
  jobId: string,
  options: { requireOpen?: boolean } = {},
): Promise<CompanionJob> {
  const { data, error } = await getSupabaseAdmin()
    .from("analysis_jobs")
    .select(
      "id, project_id, owner_id, workflow, params, status, progress, target_id, created_at, started_at",
    )
    .eq("id", jobId)
    .eq("companion_id", companion.id)
    .eq("owner_id", companion.owner_id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ApiError(404, "not_found", "Job not found");

  if (options.requireOpen && !["claimed", "running"].includes(data.status)) {
    throw new ApiError(409, "conflict", "This job is no longer open");
  }

  return data as CompanionJob;
}
