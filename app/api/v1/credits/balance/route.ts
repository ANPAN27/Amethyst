import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonOk, withRouteHandler } from "@/lib/api/errors";
import { getCreditBalance } from "@/lib/services/credits";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    const balance = await getCreditBalance(user);
    return jsonOk({ balance });
  });
}
