import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonOk, withRouteHandler } from "@/lib/api/errors";
import { getPagination } from "@/lib/api/request";
import { getCreditTransactionHistory } from "@/lib/server-data";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    const { limit, offset } = getPagination(request.nextUrl.searchParams, 50, 200);
    const filter = request.nextUrl.searchParams.get("filter") ?? undefined;
    const result = await getCreditTransactionHistory(user.id, filter, limit, offset);
    return jsonOk(result);
  }, "GET /api/v1/credits/transactions");
}
