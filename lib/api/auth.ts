import "server-only";

import type { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api/errors";

export function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

/**
 * Verify the caller from a Supabase access token or the cookie session.
 * Identity always comes from Supabase, never from a request body or header.
 */
export async function requireUser(request: NextRequest): Promise<User> {
  const token = getBearerToken(request);

  if (token) {
    const { data, error } = await getSupabaseAdmin().auth.getUser(token);
    if (error || !data.user) {
      throw new ApiError(401, "unauthorized", "Invalid or expired session");
    }
    return data.user;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new ApiError(401, "unauthorized", "Authentication required");
  }
  return data.user;
}

export type ProjectRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Fetch a project only if it belongs to the authenticated user. A different
 * owner's project is indistinguishable from a missing project.
 */
export async function requireProject(user: User, projectId: string): Promise<ProjectRow> {
  const { data, error } = await getSupabaseAdmin()
    .from("projects")
    .select("id, owner_id, name, description, created_at, updated_at")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ApiError(404, "not_found", "Project not found");
  return data as ProjectRow;
}
