import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonOk, withRouteHandler } from "@/lib/api/errors";
import { parseJson } from "@/lib/api/request";
import { createProjectSchema } from "@/lib/validation/schemas";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    const { data, error } = await getSupabaseAdmin()
      .from("projects")
      .select("id, name, description, created_at, updated_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    return jsonOk({ projects: data ?? [] });
  });
}

export async function POST(request: NextRequest) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    await enforceRateLimit(user.id, "projects:create", 30, 60);
    const body = await parseJson(request, createProjectSchema);

    const { data, error } = await getSupabaseAdmin()
      .from("projects")
      .insert({
        owner_id: user.id,
        name: body.name,
        description: body.description ?? null,
      })
      .select("id, name, description, created_at, updated_at")
      .single();

    if (error) throw error;
    return jsonOk({ project: data }, 201);
  });
}
