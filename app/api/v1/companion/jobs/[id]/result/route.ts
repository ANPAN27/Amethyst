import type { NextRequest } from "next/server";
import { authenticateCompanion } from "@/lib/services/companions";
import { getCompanionJob } from "@/lib/services/companion-jobs";
import { ApiError, jsonOk, withRouteHandler } from "@/lib/api/errors";
import { parseJson, parseUuid } from "@/lib/api/request";
import { jobResultSchema } from "@/lib/validation/schemas";
import { isPathForJob, verifyUploadedArtifact } from "@/lib/services/artifacts";
import { syncJobGraph } from "@/lib/services/tigergraph";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

const MAX_RESULT_BYTES = 10 * 1_048_576;

export async function POST(request: NextRequest, context: Context) {
  return withRouteHandler(async () => {
    const companion = await authenticateCompanion(request);
    const jobId = parseUuid((await context.params).id, "job id");
    await enforceRateLimit(companion.id, "companion:result", 120, 3600);
    const job = await getCompanionJob(companion, jobId, { requireOpen: true });
    const body = await parseJson(request, jobResultSchema, MAX_RESULT_BYTES);

    if (body.artifact) {
      if (!isPathForJob(body.artifact.path, job.project_id, job.id)) {
        throw new ApiError(400, "invalid_request", "Artifact path does not belong to this job");
      }
      await verifyUploadedArtifact({
        path: body.artifact.path,
        sha256: body.artifact.sha256,
        sizeBytes: body.artifact.size_bytes,
      });
    }

    const summary = {
      ...(body.summary ?? {}),
      rea: body.rea ?? null,
      reported_by: "companion",
    };

    const { data, error } = await getSupabaseAdmin().rpc("finalize_job", {
      p_job_id: job.id,
      p_owner_id: companion.owner_id,
      p_companion_id: companion.id,
      p_status: body.status,
      p_error_code: body.error?.code ?? null,
      p_error_message: body.error?.message ?? null,
      p_summary: summary,
      p_findings: body.status === "succeeded" ? (body.findings ?? []) : [],
      p_artifact_path: body.status === "succeeded" ? body.artifact?.path ?? null : null,
      p_artifact_sha256: body.status === "succeeded" ? body.artifact?.sha256 ?? null : null,
      p_artifact_size: body.status === "succeeded" ? body.artifact?.size_bytes ?? null : null,
      p_graph: body.status === "succeeded" ? (body.graph ?? null) : null,
    });

    if (error) throw error;

    if (body.status === "succeeded" && body.graph) {
      await syncJobGraph({
        jobId: job.id,
        projectId: job.project_id,
        entities: body.graph.entities,
        edges: body.graph.edges,
      });
    }

    const { data: graphSync } = await getSupabaseAdmin()
      .from("graph_sync")
      .select("status, vertices_upserted, edges_upserted, error_message")
      .eq("job_id", job.id)
      .maybeSingle();

    return jsonOk({ result: data, graph_sync: graphSync ?? null });
  });
}
