import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonOk, withRouteHandler } from "@/lib/api/errors";
import { parseJson } from "@/lib/api/request";
import { checkoutSchema } from "@/lib/validation/schemas";
import { createCreditCheckout } from "@/lib/services/dodo";
import { enforceRateLimit } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    await enforceRateLimit(user.id, "credits:checkout", 10, 3600);
    const body = await parseJson(request, checkoutSchema);
    const checkout = await createCreditCheckout(user, body.product_id);
    return jsonOk({ checkout }, 201);
  });
}
