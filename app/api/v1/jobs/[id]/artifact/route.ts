import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { ApiError, jsonOk, withRouteHandler } from "@/lib/api/errors";
import { parseUuid } from "@/lib/api/request";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { serverConfig } from "@/lib/config";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    const jobId = parseUuid((await context.params).id, "job id");
    const admin = getSupabaseAdmin();

    const { data: artifact, error } = await admin
      .from("analysis_artifacts")
      .select("storage_path, sha256, size_bytes")
      .eq("job_id", jobId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (error) throw error;
    if (!artifact) throw new ApiError(404, "not_found", "Artifact not found");

    const { data, error: signError } = await admin.storage
      .from(serverConfig.artifactBucket)
      .createSignedUrl(artifact.storage_path, 300);

    if (signError || !data) throw signError ?? new Error("Failed to sign artifact URL");

    return jsonOk({
      url: data.signedUrl,
      expires_in_seconds: 300,
      sha256: artifact.sha256,
      size_bytes: artifact.size_bytes,
    });
  });
}
