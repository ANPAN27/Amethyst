import type { NextRequest } from "next/server";
import { authenticateCompanion } from "@/lib/services/companions";
import { getCompanionJob } from "@/lib/services/companion-jobs";
import { ApiError, jsonOk, withRouteHandler } from "@/lib/api/errors";
import { parseJson, parseUuid } from "@/lib/api/request";
import { jobProgressSchema } from "@/lib/validation/schemas";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  return withRouteHandler(async () => {
    const companion = await authenticateCompanion(request);
    const jobId = parseUuid((await context.params).id, "job id");
    await enforceRateLimit(companion.id, "companion:progress", 600, 3600);
    const job = await getCompanionJob(companion, jobId, { requireOpen: true });
    const body = await parseJson(request, jobProgressSchema);

    const now = new Date().toISOString();
    const { data: updated, error } = await getSupabaseAdmin()
      .from("analysis_jobs")
      .update({
        status: "running",
        progress: body.progress,
        started_at: job.started_at ?? now,
        lease_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      })
      .eq("id", jobId)
      .eq("companion_id", companion.id)
      .in("status", ["claimed", "running"])
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!updated) {
      throw new ApiError(409, "conflict", "This job is no longer open");
    }
    return jsonOk({ job_id: jobId, progress: body.progress, status: "running" });
  });
}
