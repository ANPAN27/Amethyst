import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonOk, withRouteHandler } from "@/lib/api/errors";
import { listCreditPacks } from "@/lib/services/credit-packs";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return withRouteHandler(async () => {
    await requireUser(request);
    const packs = await listCreditPacks();
    return jsonOk({ packs });
  }, "GET /api/v1/credits/packs");
}
