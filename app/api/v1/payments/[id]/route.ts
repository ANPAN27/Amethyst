import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { ApiError, jsonOk, withRouteHandler } from "@/lib/api/errors";
import { parseUuid } from "@/lib/api/request";
import { getPaymentDetail } from "@/lib/server-data";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    const paymentId = parseUuid((await context.params).id, "payment id");
    const detail = await getPaymentDetail(user.id, paymentId);
    if (!detail) {
      throw new ApiError(404, "not_found", "Payment not found");
    }
    return jsonOk(detail);
  }, "GET /api/v1/payments/:id");
}
