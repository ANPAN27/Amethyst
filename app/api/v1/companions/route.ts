import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonOk, withRouteHandler } from "@/lib/api/errors";
import { listCompanions } from "@/lib/services/companions";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    const companions = await listCompanions(user);
    return jsonOk({ companions });
  });
}
