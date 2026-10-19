import type { NextRequest } from "next/server";
import { jsonOk, withRouteHandler } from "@/lib/api/errors";
import { parseJson } from "@/lib/api/request";
import { exchangePairingCodeSchema } from "@/lib/validation/schemas";
import { exchangePairingCode } from "@/lib/services/companions";
import { enforceRateLimit } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: NextRequest) {
  return withRouteHandler(async () => {
    await enforceRateLimit(clientKey(request), "companion:pair", 10, 60);
    const body = await parseJson(request, exchangePairingCodeSchema);
    const result = await exchangePairingCode({
      code: body.code,
      name: body.name,
      platform: body.platform,
      version: body.version,
      capabilities: body.capabilities,
    });

    // The bearer token is shown exactly once and only its HMAC is stored.
    return jsonOk(result, 201, { "Cache-Control": "no-store" });
  });
}
