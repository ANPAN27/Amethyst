import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonOk, withRouteHandler } from "@/lib/api/errors";
import { parseJson } from "@/lib/api/request";
import { createPairingCodeSchema } from "@/lib/validation/schemas";
import { createPairingCode } from "@/lib/services/companions";
import { enforceRateLimit } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    await enforceRateLimit(user.id, "companions:pairing", 5, 600);
    const body = await parseJson(request, createPairingCodeSchema);
    const pairing = await createPairingCode(user, body.companion_name);
    return jsonOk({ pairing }, 201);
  });
}
