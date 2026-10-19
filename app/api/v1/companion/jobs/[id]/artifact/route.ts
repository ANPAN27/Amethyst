import type { NextRequest } from "next/server";
import { authenticateCompanion } from "@/lib/services/companions";
import { getCompanionJob } from "@/lib/services/companion-jobs";
import { ApiError, jsonOk, withRouteHandler } from "@/lib/api/errors";
import { parseUuid } from "@/lib/api/request";
import { buildArtifactPath, createArtifactUploadUrl } from "@/lib/services/artifacts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { serverConfig } from "@/lib/config";
import { enforceRateLimit } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  return withRouteHandler(async () => {
    const companion = await authenticateCompanion(request);
    const jobId = parseUuid((await context.params).id, "job id");
    await enforceRateLimit(companion.id, "companion:artifact", 120, 3600);
    const job = await getCompanionJob(companion, jobId, { requireOpen: true });

    const { data: existing, error } = await getSupabaseAdmin()
      .from("analysis_artifacts")
      .select("id")
      .eq("job_id", jobId)
      .maybeSingle();

    if (error) throw error;
    if (existing) throw new ApiError(409, "conflict", "An artifact has already been submitted");

    const path = buildArtifactPath(job.project_id, job.id);
    const signed = await createArtifactUploadUrl(path);
    if (!signed?.signedUrl) throw new ApiError(503, "upstream_unavailable", "Unable to sign upload");

    return jsonOk({
      bucket: serverConfig.artifactBucket,
      path,
      token: signed.token,
      signed_url: signed.signedUrl,
      method: "PUT",
      content_type: "application/json",
      max_bytes: serverConfig.maxArtifactBytes,
    });
  });
}
