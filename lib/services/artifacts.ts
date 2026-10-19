import "server-only";

import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { serverConfig } from "@/lib/config";
import { ApiError } from "@/lib/api/errors";

export function buildArtifactPath(projectId: string, jobId: string): string {
  const nonce = crypto.randomUUID();
  return `${projectId}/${jobId}/${nonce}.json`;
}

export function isPathForJob(path: string, projectId: string, jobId: string): boolean {
  return path.startsWith(`${projectId}/${jobId}/`) && !path.includes("..");
}

export async function createArtifactUploadUrl(path: string) {
  const { data, error } = await getSupabaseAdmin()
    .storage.from(serverConfig.artifactBucket)
    .createSignedUploadUrl(path, { upsert: false });

  if (error) throw error;
  return data;
}

export async function verifyUploadedArtifact(input: {
  path: string;
  sha256: string;
  sizeBytes: number;
}): Promise<void> {
  if (input.sizeBytes > serverConfig.maxArtifactBytes) {
    throw new ApiError(413, "invalid_request", "Artifact exceeds the size limit");
  }

  const { data, error } = await getSupabaseAdmin()
    .storage.from(serverConfig.artifactBucket)
    .download(input.path);

  if (error || !data) {
    throw new ApiError(400, "invalid_request", "Artifact was not uploaded");
  }

  const bytes = Buffer.from(await data.arrayBuffer());
  if (bytes.byteLength > serverConfig.maxArtifactBytes) {
    throw new ApiError(413, "invalid_request", "Artifact exceeds the size limit");
  }
  if (bytes.byteLength !== input.sizeBytes) {
    throw new ApiError(400, "invalid_request", "Artifact size does not match the submitted manifest");
  }

  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== input.sha256) {
    throw new ApiError(400, "invalid_request", "Artifact digest does not match the submitted manifest");
  }
}
