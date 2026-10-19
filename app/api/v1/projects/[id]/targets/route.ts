import type { NextRequest } from "next/server";
import { requireProject, requireUser } from "@/lib/api/auth";
import { jsonOk, withRouteHandler } from "@/lib/api/errors";
import { parseJson, parseUuid } from "@/lib/api/request";
import { createTargetSchema } from "@/lib/validation/schemas";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    const projectId = parseUuid((await context.params).id, "project id");
    await requireProject(user, projectId);

    const { data, error } = await getSupabaseAdmin()
      .from("analysis_targets")
      .select("id, kind, label, target_digest, metadata, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return jsonOk({ targets: data ?? [] });
  });
}

export async function POST(request: NextRequest, context: Context) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    const projectId = parseUuid((await context.params).id, "project id");
    await requireProject(user, projectId);
    await enforceRateLimit(user.id, "targets:create", 60, 60);
    const body = await parseJson(request, createTargetSchema);

    const { data, error } = await getSupabaseAdmin()
      .from("analysis_targets")
      .insert({
        project_id: projectId,
        kind: body.kind,
        label: body.label,
        target_path: body.target_path,
        target_digest: body.target_digest ?? null,
        metadata: body.metadata ?? {},
      })
      .select("id, kind, label, target_path, target_digest, metadata, created_at")
      .single();

    if (error) throw error;
    return jsonOk({ target: data }, 201);
  });
}
