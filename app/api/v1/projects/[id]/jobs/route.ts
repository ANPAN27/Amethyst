import type { NextRequest } from "next/server";
import { requireProject, requireUser } from "@/lib/api/auth";
import { ApiError, jsonOk, withRouteHandler } from "@/lib/api/errors";
import { getPagination, parseJson, parseUuid } from "@/lib/api/request";
import { createJobSchema } from "@/lib/validation/schemas";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { PUBLIC_JOB_FIELDS, workflowMatchesTargetKind } from "@/lib/services/jobs";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    const projectId = parseUuid((await context.params).id, "project id");
    await requireProject(user, projectId);
    const { limit, offset } = getPagination(request.nextUrl.searchParams);

    const { data, error } = await getSupabaseAdmin()
      .from("analysis_jobs")
      .select(PUBLIC_JOB_FIELDS)
      .eq("project_id", projectId)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return jsonOk({ jobs: data ?? [], limit, offset });
  });
}

export async function POST(request: NextRequest, context: Context) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    const projectId = parseUuid((await context.params).id, "project id");
    await requireProject(user, projectId);
    await enforceRateLimit(user.id, "jobs:create", 30, 60);

    const body = await parseJson(request, createJobSchema);
    const admin = getSupabaseAdmin();

    const { data: target, error: targetError } = await admin
      .from("analysis_targets")
      .select("id, kind, target_path, label")
      .eq("id", body.target_id)
      .eq("project_id", projectId)
      .maybeSingle();

    if (targetError) throw targetError;
    if (!target) throw new ApiError(400, "invalid_request", "Analysis target not found");

    if (!workflowMatchesTargetKind(body.workflow, target.kind)) {
      throw new ApiError(400, "invalid_request", "Workflow does not match the target kind", {
        expected_target_kind: target.kind,
      });
    }

    const { data: companion, error: companionError } = await admin
      .from("companions")
      .select("id, status, capabilities")
      .eq("id", body.companion_id)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (companionError) throw companionError;
    if (!companion || companion.status !== "active") {
      throw new ApiError(400, "invalid_request", "Companion is not paired or is revoked");
    }
    if (!Array.isArray(companion.capabilities) || !companion.capabilities.includes(body.workflow)) {
      throw new ApiError(400, "invalid_request", "Companion does not advertise this workflow");
    }

    const { data, error } = await admin
      .from("analysis_jobs")
      .insert({
        project_id: projectId,
        owner_id: user.id,
        companion_id: body.companion_id,
        target_id: body.target_id,
        workflow: body.workflow,
        params: body.params ?? {},
        idempotency_key: body.idempotency_key ?? null,
        status: "queued",
      })
      .select(PUBLIC_JOB_FIELDS)
      .single();

    if (error) {
      if (error.code === "23505" && body.idempotency_key) {
        const { data: existing, error: existingError } = await admin
          .from("analysis_jobs")
          .select(PUBLIC_JOB_FIELDS)
          .eq("owner_id", user.id)
          .eq("idempotency_key", body.idempotency_key)
          .single();
        if (existingError) throw existingError;
        return jsonOk({ job: existing, idempotent: true });
      }
      throw error;
    }

    return jsonOk(
      {
        job: data,
        target: { id: target.id, label: target.label, kind: target.kind },
      },
      201,
    );
  });
}
