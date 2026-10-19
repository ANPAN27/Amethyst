import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { ApiError, jsonOk, withRouteHandler } from "@/lib/api/errors";
import { parseUuid } from "@/lib/api/request";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { syncJobGraph } from "@/lib/services/tigergraph";
import { enforceRateLimit } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const graphPayloadSchema = z.object({
  entities: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      label: z.string().optional(),
      properties: z.record(z.unknown()).optional(),
    }),
  ),
  edges: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      type: z.string(),
      properties: z.record(z.unknown()).optional(),
    }),
  ),
});

export async function POST(request: NextRequest, context: Context) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    const jobId = parseUuid((await context.params).id, "job id");
    await enforceRateLimit(user.id, "graph:sync", 10, 60);
    const admin = getSupabaseAdmin();

    const { data: job, error } = await admin
      .from("analysis_jobs")
      .select("id, project_id, status")
      .eq("id", jobId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (error) throw error;
    if (!job) throw new ApiError(404, "not_found", "Job not found");
    if (job.status !== "succeeded") {
      throw new ApiError(409, "conflict", "Only a succeeded job can be synchronized");
    }

    const { data: syncRow, error: syncError } = await admin
      .from("graph_sync")
      .select("graph_payload")
      .eq("job_id", jobId)
      .maybeSingle();

    if (syncError) throw syncError;

    const parsed = graphPayloadSchema.safeParse(syncRow?.graph_payload);
    if (!parsed.success) {
      throw new ApiError(400, "invalid_request", "No stored graph payload for this job");
    }

    await syncJobGraph({
      jobId,
      projectId: job.project_id,
      entities: parsed.data.entities,
      edges: parsed.data.edges,
    });

    const { data: updated } = await admin
      .from("graph_sync")
      .select("status, vertices_upserted, edges_upserted, error_message, completed_at")
      .eq("job_id", jobId)
      .maybeSingle();

    return jsonOk({ graph_sync: updated ?? null });
  });
}
