import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonOk, withRouteHandler } from "@/lib/api/errors";
import { parseUuid } from "@/lib/api/request";
import { revokeCompanion } from "@/lib/services/companions";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: Context) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    const companionId = parseUuid((await context.params).id, "companion id");
    await revokeCompanion(user, companionId);
    return jsonOk({ revoked: true });
  });
}
