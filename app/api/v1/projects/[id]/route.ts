import type { NextRequest } from "next/server";
import { requireProject, requireUser } from "@/lib/api/auth";
import { jsonOk, withRouteHandler } from "@/lib/api/errors";
import { parseJson, parseUuid } from "@/lib/api/request";
import { updateProjectSchema } from "@/lib/validation/schemas";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    const projectId = parseUuid((await context.params).id, "project id");
    const project = await requireProject(user, projectId);

    const { data: jobs, error } = await getSupabaseAdmin()
      .from("analysis_jobs")
      .select("id, workflow, status, progress, created_at, finished_at")
      .eq("project_id", projectId)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    return jsonOk({ project, recent_jobs: jobs ?? [] });
  });
}

export async function PATCH(request: NextRequest, context: Context) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    const projectId = parseUuid((await context.params).id, "project id");
    await requireProject(user, projectId);
    const body = await parseJson(request, updateProjectSchema);

    const { data, error } = await getSupabaseAdmin()
      .from("projects")
      .update({
        ...(body.name === undefined ? {} : { name: body.name }),
        ...(body.description === undefined ? {} : { description: body.description }),
      })
      .eq("id", projectId)
      .eq("owner_id", user.id)
      .select("id, name, description, created_at, updated_at")
      .single();

    if (error) throw error;
    return jsonOk({ project: data });
  });
}

export async function DELETE(request: NextRequest, context: Context) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    const projectId = parseUuid((await context.params).id, "project id");
    await requireProject(user, projectId);

    const { error } = await getSupabaseAdmin()
      .from("projects")
      .delete()
      .eq("id", projectId)
      .eq("owner_id", user.id);

    if (error) throw error;
    return jsonOk({ deleted: true });
  });
}
