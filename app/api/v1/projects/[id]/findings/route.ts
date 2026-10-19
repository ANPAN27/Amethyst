import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireProject, requireUser } from "@/lib/api/auth";
import { jsonOk, withRouteHandler } from "@/lib/api/errors";
import { getPagination, parseUuid } from "@/lib/api/request";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const classFilter = z.enum([
  "observed",
  "verified_relationship",
  "inferred",
  "ai_interpretation",
  "proposed_code",
]);

export async function GET(request: NextRequest, context: Context) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    const projectId = parseUuid((await context.params).id, "project id");
    await requireProject(user, projectId);
    const { limit, offset } = getPagination(request.nextUrl.searchParams, 50, 500);

    const jobIdRaw = request.nextUrl.searchParams.get("job_id");
    const classRaw = request.nextUrl.searchParams.get("class");

    let query = getSupabaseAdmin()
      .from("findings")
      .select("id, job_id, class, category, title, detail, confidence, evidence, created_at")
      .eq("project_id", projectId)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (jobIdRaw) query = query.eq("job_id", parseUuid(jobIdRaw, "job_id"));
    if (classRaw) query = query.eq("class", classFilter.parse(classRaw));

    const { data, error } = await query;
    if (error) throw error;

    return jsonOk({ findings: data ?? [], limit, offset });
  });
}
