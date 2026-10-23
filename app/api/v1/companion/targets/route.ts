import type { NextRequest } from "next/server";
import { authenticateCompanion } from "@/lib/services/companions";
import { ApiError, jsonOk, withRouteHandler } from "@/lib/api/errors";
import { parseJson } from "@/lib/api/request";
import { companionTargetSchema } from "@/lib/validation/schemas";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { workflowForTargetKind } from "@/lib/services/jobs";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return withRouteHandler(async () => {
    const companion = await authenticateCompanion(request);
    await enforceRateLimit(companion.id, "companion:targets", 30, 3600);
    const body = await parseJson(request, companionTargetSchema);
    const admin = getSupabaseAdmin();

    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id")
      .eq("id", body.project_id)
      .eq("owner_id", companion.owner_id)
      .maybeSingle();

    if (projectError) throw projectError;
    if (!project) throw new ApiError(404, "not_found", "Project not found");

    const workflow = workflowForTargetKind(body.kind);
    if (!workflow) {
      throw new ApiError(400, "invalid_request", "Unsupported target kind");
    }
    if (!companion.capabilities.includes(workflow)) {
      throw new ApiError(400, "invalid_request", "Companion does not advertise this workflow");
    }

    const { data, error } = await admin
      .from("analysis_targets")
      .insert({
        project_id: body.project_id,
        kind: body.kind,
        label: body.label,
        target_path: body.target_path,
        metadata: {
          ...(body.metadata ?? {}),
          companion_id: companion.id,
          selection: body.metadata?.selection ?? "companion_picker",
        },
      })
      .select("id, kind, label, target_path, metadata, created_at")
      .single();

    if (error) throw error;
    return jsonOk({ target: data }, 201);
  });
}
