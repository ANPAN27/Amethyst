import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonOk, withRouteHandler } from "@/lib/api/errors";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCreditBalance } from "@/lib/services/credits";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    const { data: profile } = await getSupabaseAdmin()
      .from("profiles")
      .select("id, email, display_name, created_at")
      .eq("id", user.id)
      .maybeSingle();

    const credits = await getCreditBalance(user);

    return jsonOk({
      user: {
        id: user.id,
        email: user.email ?? null,
        display_name: profile?.display_name ?? null,
      },
      credits,
    });
  });
}
