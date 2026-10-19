import type { NextRequest } from "next/server";
import { authenticateCompanion, revokeCompanionSelf } from "@/lib/services/companions";
import { jsonOk, withRouteHandler } from "@/lib/api/errors";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return withRouteHandler(async () => {
    const companion = await authenticateCompanion(request);
    return jsonOk({
      companion: {
        id: companion.id,
        name: companion.name,
        platform: companion.platform,
        version: companion.version,
        capabilities: companion.capabilities,
        status: companion.status,
        paired_at: companion.paired_at,
        last_seen_at: companion.last_seen_at,
      },
    });
  });
}

export async function DELETE(request: NextRequest) {
  return withRouteHandler(async () => {
    const companion = await authenticateCompanion(request);
    await revokeCompanionSelf(companion);
    return jsonOk({ revoked: true });
  });
}
