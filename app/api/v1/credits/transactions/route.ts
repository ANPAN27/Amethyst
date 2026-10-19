import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonOk, withRouteHandler } from "@/lib/api/errors";
import { getPagination } from "@/lib/api/request";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    const { limit, offset } = getPagination(request.nextUrl.searchParams, 50, 200);

    const { data, error } = await getSupabaseAdmin()
      .from("credit_transactions")
      .select("id, kind, amount, delta, balance_after, reference_type, reference_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return jsonOk({ transactions: data ?? [], limit, offset });
  });
}
