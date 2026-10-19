import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { ApiError, jsonOk, withRouteHandler } from "@/lib/api/errors";
import { parseUuid } from "@/lib/api/request";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PUBLIC_JOB_FIELDS } from "@/lib/services/jobs";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    const jobId = parseUuid((await context.params).id, "job id");
    const admin = getSupabaseAdmin();

    const { data: job, error } = await admin
      .from("analysis_jobs")
      .select(PUBLIC_JOB_FIELDS)
      .eq("id", jobId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (error) throw error;
    if (!job) throw new ApiError(404, "not_found", "Job not found");

    const [{ data: target }, { data: graphSync }, { data: artifact }] = await Promise.all([
      job.target_id
        ? admin
            .from("analysis_targets")
            .select("id, kind, label, target_path, created_at")
            .eq("id", job.target_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      admin
        .from("graph_sync")
        .select("status, vertices_upserted, edges_upserted, error_message, completed_at")
        .eq("job_id", jobId)
        .maybeSingle(),
      admin
        .from("analysis_artifacts")
        .select("sha256, size_bytes, content_type, created_at")
        .eq("job_id", jobId)
        .maybeSingle(),
    ]);

    return jsonOk({ job, target: target ?? null, graph_sync: graphSync ?? null, artifact: artifact ?? null });
  });
}
