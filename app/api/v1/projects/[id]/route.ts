import type { NextRequest } from "next/server";
import { requireProject, requireUser } from "@/lib/api/auth";
import { jsonOk, withRouteHandler } from "@/lib/api/errors";
import { parseJson, parseUuid } from "@/lib/api/request";
import { updateProjectSchema } from "@/lib/validation/schemas";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { serverConfig } from "@/lib/config";
import { enforceRateLimit } from "@/lib/api/rate-limit";

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
    await enforceRateLimit(user.id, "projects:delete", 10, 60);

    const admin = getSupabaseAdmin();
    const paths: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error: listError } = await admin
        .from("analysis_artifacts")
        .select("storage_path")
        .eq("project_id", projectId)
        .eq("owner_id", user.id)
        .range(offset, offset + 999);

      if (listError) throw listError;
      paths.push(...(data ?? []).map((artifact) => artifact.storage_path));
      if (!data || data.length < 1000) break;
    }

    const { error } = await admin
      .from("projects")
      .delete()
      .eq("id", projectId)
      .eq("owner_id", user.id);

    if (error) throw error;

    for (let index = 0; index < paths.length; index += 100) {
      const { error: removeError } = await admin.storage
        .from(serverConfig.artifactBucket)
        .remove(paths.slice(index, index + 100));
      if (removeError) {
        console.error("[projects] failed to remove artifact objects", removeError.name);
        break;
      }
    }

    return jsonOk({ deleted: true });
  });
}
