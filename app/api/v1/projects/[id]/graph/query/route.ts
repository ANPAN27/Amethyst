import type { NextRequest } from "next/server";
import { requireProject, requireUser } from "@/lib/api/auth";
import { jsonOk, withRouteHandler } from "@/lib/api/errors";
import { parseJson, parseUuid } from "@/lib/api/request";
import { graphQuerySchema } from "@/lib/validation/schemas";
import { queryNeighbors } from "@/lib/services/tigergraph";
import { enforceRateLimit } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    const projectId = parseUuid((await context.params).id, "project id");
    await requireProject(user, projectId);
    await enforceRateLimit(user.id, "graph:query", 60, 60);
    const body = await parseJson(request, graphQuerySchema);

    const result = await queryNeighbors({
      projectId,
      entityId: body.entity_id,
      depth: body.depth,
    });

    return jsonOk({ result });
  });
}
