import "server-only";

import { serverConfig } from "@/lib/config";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/api/errors";

export type GraphEntity = {
  id: string;
  type: string;
  label?: string;
  properties?: Record<string, unknown>;
};

export type GraphEdge = {
  from: string;
  to: string;
  type: string;
  properties?: Record<string, unknown>;
};

const MAX_PROPERTIES_CHARS = 8000;

function scopedId(projectId: string, entityId: string): string {
  return `${projectId}:${entityId}`;
}

function safeProperties(value: Record<string, unknown> | undefined): string {
  if (!value) return "{}";
  const json = JSON.stringify(value);
  return json.length > MAX_PROPERTIES_CHARS ? json.slice(0, MAX_PROPERTIES_CHARS) : json;
}

function graphEndpoint(path: string): string {
  const base = serverConfig.tigerGraph.url.replace(/\/+$/, "");
  return `${base}${path}`;
}

async function tigerGraphFetch(path: string, init: RequestInit): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (serverConfig.tigerGraph.token) {
    headers.Authorization = `Bearer ${serverConfig.tigerGraph.token}`;
  }

  let response: Response;
  try {
    response = await fetch(graphEndpoint(path), {
      ...init,
      headers,
      signal: AbortSignal.timeout(serverConfig.tigerGraph.timeoutMs),
    });
  } catch {
    throw new Error("TigerGraph request failed or timed out");
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`TigerGraph returned HTTP ${response.status}`);
  }

  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function isGraphEnabled(): boolean {
  return serverConfig.tigerGraph.enabled;
}

/**
 * Idempotent upsert keyed by project-scoped vertex ids. Re-running a sync for
 * the same job overwrites the same vertices and edges.
 */
export async function upsertGraph(input: {
  projectId: string;
  jobId: string;
  entities: GraphEntity[];
  edges: GraphEdge[];
}): Promise<{ vertices: number; edges: number }> {
  const vertices: Record<string, Record<string, unknown>> = {};
  const edges: Record<string, Record<string, Record<string, unknown>>> = {};

  const known = new Set(input.entities.map((entity) => entity.id));

  for (const entity of input.entities) {
    const id = scopedId(input.projectId, entity.id);
    vertices[id] = {
      entity_id: entity.id,
      project_id: input.projectId,
      entity_type: entity.type,
      label: entity.label ?? entity.id,
      properties: safeProperties(entity.properties),
      job_id: input.jobId,
    };
  }

  for (const edge of input.edges) {
    if (!known.has(edge.from) || !known.has(edge.to)) continue;
    const from = scopedId(input.projectId, edge.from);
    const to = scopedId(input.projectId, edge.to);
    edges[from] ??= {};
    edges[from][to] = {
      project_id: input.projectId,
      relation: edge.type,
      properties: safeProperties(edge.properties),
      job_id: input.jobId,
    };
  }

  if (Object.keys(vertices).length === 0 && Object.keys(edges).length === 0) {
    return { vertices: 0, edges: 0 };
  }

  await tigerGraphFetch(`/graph/${encodeURIComponent(serverConfig.tigerGraph.graph)}/upsert`, {
    method: "POST",
    body: JSON.stringify({
      vertices: { AmethystEntity: vertices },
      edges: { AmethystRelation: { AmethystEntity: edges } },
    }),
  });

  return {
    vertices: Object.keys(vertices).length,
    edges: Object.values(edges).reduce(
      (total, targets) => total + Object.keys(targets).length,
      0,
    ),
  };
}

export async function queryNeighbors(input: {
  projectId: string;
  entityId: string;
  depth: number;
}): Promise<unknown> {
  if (!isGraphEnabled()) {
    throw new ApiError(503, "upstream_unavailable", "TigerGraph is not configured");
  }

  return tigerGraphFetch(
    `/query/${encodeURIComponent(serverConfig.tigerGraph.graph)}/amethyst_neighbors`,
    {
      method: "POST",
      body: JSON.stringify({
        project_id: input.projectId,
        entity_id: input.entityId,
        depth: input.depth,
      }),
    },
  );
}

/**
 * Best-effort graph synchronization. A graph outage must never discard a valid
 * analysis result; the failure is recorded and can be retried later.
 */
export async function syncJobGraph(input: {
  jobId: string;
  projectId: string;
  entities: GraphEntity[];
  edges: GraphEdge[];
}): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data: row, error } = await admin
    .from("graph_sync")
    .select("id")
    .eq("job_id", input.jobId)
    .maybeSingle();

  if (error) return;

  if (!isGraphEnabled()) {
    if (row) {
      await admin
        .from("graph_sync")
        .update({
          status: "skipped",
          error_message: "TigerGraph is not configured",
          attempted_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }
    return;
  }

  await admin
    .from("graph_sync")
    .update({ status: "pending", attempted_at: new Date().toISOString() })
    .eq("job_id", input.jobId);

  try {
    const result = await upsertGraph(input);
    await admin
      .from("graph_sync")
      .update({
        status: "succeeded",
        vertices_upserted: result.vertices,
        edges_upserted: result.edges,
        error_message: null,
        completed_at: new Date().toISOString(),
      })
      .eq("job_id", input.jobId);
  } catch (syncError) {
    const message =
      syncError instanceof Error ? syncError.message.slice(0, 2000) : "Graph sync failed";
    await admin
      .from("graph_sync")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("job_id", input.jobId);
  }
}
