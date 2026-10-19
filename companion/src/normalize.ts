import type { WorkflowName } from "./process.js";

export type FindingClass = "observed" | "verified_relationship" | "inferred";

export type Finding = {
  class: FindingClass;
  category?: string;
  title: string;
  detail?: string;
  confidence?: number;
  evidence?: Array<{ source: string; path?: string; note?: string }>;
};

export type Entity = {
  id: string;
  type: string;
  label?: string;
  properties?: Record<string, unknown>;
};

export type Edge = {
  from: string;
  to: string;
  type: string;
};

export type Normalized = {
  findings: Finding[];
  graph: { entities: Entity[]; edges: Edge[] };
  summary: Record<string, unknown>;
};

const MAX_FINDINGS = 5000;
const MAX_ENTITIES = 5000;
const MAX_EDGES = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function findArrayDeep(value: unknown, keys: string[], depth: number): unknown[] | null {
  if (depth < 0) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findArrayDeep(item, keys, depth - 1);
      if (found && found.length > 0) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;

  for (const key of keys) {
    const candidate = value[key];
    if (Array.isArray(candidate) && candidate.length > 0) return candidate;
  }
  for (const child of Object.values(value)) {
    const found = findArrayDeep(child, keys, depth - 1);
    if (found && found.length > 0) return found;
  }
  return null;
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function sourceOf(raw: unknown): unknown {
  if (isRecord(raw) && isRecord(raw.normalized_result)) return raw.normalized_result;
  return raw;
}

function observationProperties(node: Record<string, unknown>): Record<string, unknown> {
  for (const observation of asArray(node.observations)) {
    if (isRecord(observation) && isRecord(observation.properties)) {
      return observation.properties;
    }
    if (isRecord(observation) && typeof observation.label === "string") {
      return { label: observation.label };
    }
  }
  return {};
}

/**
 * Recent REA releases wrap the result in an evidence envelope:
 * { normalized_result: { graph: { nodes, edges } } }. Node and edge ids are
 * REA-scoped, so they are preserved to keep relationships exact.
 */
function normalizeEvidenceGraph(workflow: WorkflowName, raw: unknown): Normalized | null {
  const source = sourceOf(raw);
  if (!isRecord(source) || !isRecord(source.graph)) return null;
  const graph = source.graph;
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) return null;

  const entities: Entity[] = [];
  const findings: Finding[] = [];
  const idByNode = new Map<string, string>();
  const seenNodeIds = new Set<string>();

  for (const rawNode of graph.nodes) {
    if (entities.length >= MAX_ENTITIES) break;
    if (!isRecord(rawNode)) continue;

    const identity = isRecord(rawNode.identity) ? rawNode.identity : {};
    const props = observationProperties(rawNode);
    const rawNodeId =
      firstString(rawNode, ["node_id", "id"]) ??
      firstString(identity, ["key", "sha256"]) ??
      null;
    if (!rawNodeId || idByNode.has(rawNodeId)) continue;
    const nodeId = clip(rawNodeId, 300);
    if (seenNodeIds.has(nodeId)) continue;
    seenNodeIds.add(nodeId);

    const type = clip(firstString(rawNode, ["kind", "type", "entity_type"]) ?? "entity", 80);
    const semanticRole = firstString(props, ["semantic_role"]);
    const modulePath = firstString(props, ["module_path"]);
    const exportedName = firstString(props, ["exported_name"]);
    const label =
      (type === "javascript-module" &&
      semanticRole === "export-binding" &&
      modulePath &&
      exportedName
        ? `${modulePath}:${exportedName}`
        : null) ??
      firstString(props, ["logical_module_key", "path", "name", "label"]) ??
      firstString(identity, ["key", "sha256"]) ??
      nodeId;

    idByNode.set(rawNodeId, nodeId);
    entities.push({
      id: nodeId,
      type,
      label: clip(label, 300),
      properties: {
        kind: type,
        ...(firstString(props, ["path"]) ? { path: firstString(props, ["path"]) } : {}),
        ...(firstString(props, ["name"]) ? { name: firstString(props, ["name"]) } : {}),
        ...(firstString(props, ["version"]) ? { version: firstString(props, ["version"]) } : {}),
        ...(firstString(identity, ["sha256"]) ? { sha256: firstString(identity, ["sha256"]) } : {}),
        ...(firstString(props, ["semantic_role"])
          ? { semantic_role: firstString(props, ["semantic_role"]) }
          : {}),
      },
    });

    if (findings.length >= MAX_FINDINGS - 1) continue;

    if (type === "javascript-module" && semanticRole === "source-module") {
      findings.push({
        class: "observed",
        category: "module",
        title: `Module: ${clip(label, 400)}`,
        evidence: [{ source: "rea", path: label }],
      });
    } else if (type === "package") {
      const name = firstString(props, ["name"]) ?? label;
      const version = firstString(props, ["version"]);
      findings.push({
        class: "observed",
        category: "package",
        title: `Package: ${clip(version ? `${name}@${version}` : name, 400)}`,
        evidence: [{ source: "rea", path: label }],
      });
    } else if (type === "javascript-module" && semanticRole === "export-binding") {
      findings.push({
        class: "observed",
        category: "export",
        title: `Export: ${clip(label, 400)}`,
        evidence: [{ source: "rea", path: label }],
      });
    } else if (["table", "type", "dependency", "function"].includes(type)) {
      findings.push({
        class: "observed",
        category: type,
        title: `${type[0]?.toUpperCase() ?? ""}${type.slice(1)}: ${clip(label, 400)}`,
        evidence: [{ source: "rea", path: label }],
      });
    }
  }

  if (entities.length === 0) return null;

  const edges: Edge[] = [];
  const seenEdges = new Set<string>();
  for (const rawEdge of asArray(graph.edges ?? graph.relations)) {
    if (edges.length >= MAX_EDGES) break;
    if (!isRecord(rawEdge)) continue;

    const fromId = firstString(rawEdge, ["source_node_id", "source", "from"]);
    const toId = firstString(rawEdge, ["target_node_id", "target", "to"]);
    if (!fromId || !toId) continue;
    const from = idByNode.get(fromId);
    const to = idByNode.get(toId);
    if (!from || !to) continue;

    const type = clip(
      firstString(rawEdge, ["relation", "type", "kind", "label"]) ?? "RELATED_TO",
      80,
    );
    const key = `${from}\u0000${to}\u0000${type}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    edges.push({ from, to, type });
  }

  const reaSummary = isRecord(source.summary) ? source.summary : undefined;
  const reaStatistics = isRecord(source.statistics) ? source.statistics : undefined;

  findings.push({
    class: "observed",
    category: "analysis",
    title: "REA evidence inventory",
    detail:
      `Observed ${entities.length} graph entities and ${edges.length} relationships. ` +
      "Relationships include REA's static inferences; inspect each edge's evidence state before treating it as runtime behavior.",
    evidence: [{ source: "rea" }],
  });

  return {
    findings,
    graph: { entities, edges },
    summary: {
      normalized_entities: entities.length,
      normalized_edges: edges.length,
      modules: entities.filter(
        (entity) =>
          entity.type === "javascript-module" &&
          entity.properties?.semantic_role === "source-module",
      ).length,
      packages: entities.filter((entity) => entity.type === "package").length,
      ...(reaSummary ? { rea_summary: reaSummary } : {}),
      ...(reaStatistics ? { rea_statistics: reaStatistics } : {}),
    },
  };
}

function emptyResult(workflow: WorkflowName, note: string): Normalized {
  return {
    findings: [
      {
        class: "observed",
        category: "analysis",
        title: "REA analysis completed",
        detail: clip(note, 20000),
        evidence: [{ source: "rea", note: "Raw REA evidence is stored as a private artifact." }],
      },
    ],
    graph: { entities: [], edges: [] },
    summary: { normalized_entities: 0, normalized_edges: 0, workflow },
  };
}

function normalizeModules(raw: unknown): Normalized {
  const source = sourceOf(raw);
  const modules = findArrayDeep(source, ["modules"], 4) ?? [];
  const imports = findArrayDeep(source, ["imports", "edges"], 4) ?? [];

  const entities: Entity[] = [];
  const entityIds = new Set<string>();
  const idByOriginal = new Map<string, string>();
  const findings: Finding[] = [];

  for (const item of modules) {
    if (entities.length >= MAX_ENTITIES) break;

    let rawId: string | null = null;
    let label: string | null = null;
    let nestedImports: unknown[] = [];

    if (typeof item === "string") {
      rawId = item;
    } else if (isRecord(item)) {
      rawId = firstString(item, ["path", "relative_path", "file", "name", "id"]);
      label = firstString(item, ["path", "relative_path", "file", "name"]);
      nestedImports = asArray(item.imports);
    }

    const id = rawId ? clip(rawId, 300) : null;
    if (!id || entityIds.has(id)) continue;
    entityIds.add(id);
    if (rawId) idByOriginal.set(rawId, id);
    idByOriginal.set(id, id);
    entities.push({ id, type: "module", label: label ? clip(label, 300) : id });

    if (findings.length < MAX_FINDINGS - 1) {
      findings.push({
        class: "observed",
        category: "module",
        title: `Module: ${clip(id, 400)}`,
        evidence: [{ source: "rea", path: id }],
      });
    }

    for (const imported of nestedImports) {
      const target =
        typeof imported === "string"
          ? imported
          : isRecord(imported)
            ? firstString(imported, ["to", "target", "imported", "path", "name"])
            : null;
      if (target) {
        imports.push({ from: id, to: target, type: "IMPORTS" });
      }
    }
  }

  const edges: Edge[] = [];
  const seenEdges = new Set<string>();
  for (const item of imports) {
    if (edges.length >= MAX_EDGES) break;
    if (!isRecord(item)) continue;

    const fromId = firstString(item, ["from", "source", "importer", "module"]);
    const toId = firstString(item, ["to", "target", "imported", "dependency", "path"]);
    if (!fromId || !toId) continue;
    const from = idByOriginal.get(fromId);
    const to = idByOriginal.get(toId);
    if (!from || !to) continue;

    const type = clip(firstString(item, ["type", "relation", "kind"]) ?? "IMPORTS", 80);
    const key = `${from}\u0000${to}\u0000${type}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    edges.push({ from, to, type });
  }

  if (entities.length === 0) {
    return emptyResult(
      "analyze_javascript_application",
      "REA completed, but the output did not contain a recognized module inventory. Raw evidence is preserved; no findings were inferred from an unknown shape.",
    );
  }

  findings.push({
    class: "observed",
    category: "analysis",
    title: "JavaScript application inventory",
    detail: `Observed ${entities.length} modules and ${edges.length} recognized import relationships. Unrecognized relationships are not reported.`,
    evidence: [{ source: "rea" }],
  });

  return {
    findings,
    graph: { entities, edges },
    summary: {
      modules: entities.length,
      imports: edges.length,
      normalized_entities: entities.length,
      normalized_edges: edges.length,
    },
  };
}

function normalizeTables(raw: unknown): Normalized {
  const source = sourceOf(raw);
  const tables = findArrayDeep(source, ["tables"], 3) ?? [];
  const entities: Entity[] = [];
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const table of tables) {
    const name =
      typeof table === "string"
        ? table
        : isRecord(table)
          ? firstString(table, ["name", "table_name", "id"])
          : null;
    if (!name) continue;
    const id = clip(name, 300);
    if (seen.has(id)) continue;
    if (entities.length >= MAX_ENTITIES) break;
    seen.add(id);
    entities.push({ id, type: "table", label: clip(name, 300) });
    findings.push({
      class: "observed",
      category: "table",
      title: `Table: ${clip(name, 400)}`,
      evidence: [{ source: "rea", path: name }],
    });
  }

  if (entities.length === 0) {
    return emptyResult(
      "inspect_sqlite_database",
      "REA completed, but no table inventory was recognized. Raw evidence is preserved.",
    );
  }

  findings.push({
    class: "observed",
    category: "analysis",
    title: "SQLite schema inventory",
    detail: `Observed ${entities.length} tables.`,
    evidence: [{ source: "rea" }],
  });

  return {
    findings,
    graph: { entities, edges: [] },
    summary: {
      tables: entities.length,
      normalized_entities: entities.length,
      normalized_edges: 0,
    },
  };
}

function normalizeDependencies(workflow: WorkflowName, raw: unknown): Normalized {
  const source = sourceOf(raw);
  const packages = findArrayDeep(source, ["packages", "dependencies", "modules"], 3) ?? [];
  const entities: Entity[] = [];
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const pkg of packages) {
    const name =
      typeof pkg === "string"
        ? pkg
        : isRecord(pkg)
          ? firstString(pkg, ["name", "path", "module", "package"])
          : null;
    if (!name) continue;
    const id = clip(name, 300);
    if (seen.has(id)) continue;
    if (entities.length >= MAX_ENTITIES) break;
    seen.add(id);
    entities.push({ id, type: "dependency", label: clip(name, 300) });
    if (findings.length < MAX_FINDINGS - 1) {
      findings.push({
        class: "observed",
        category: "dependency",
        title: `Dependency: ${clip(name, 400)}`,
        evidence: [{ source: "rea", path: name }],
      });
    }
  }

  if (entities.length === 0) {
    return emptyResult(
      workflow,
      "REA completed, but no package inventory was recognized. Raw evidence is preserved.",
    );
  }

  findings.push({
    class: "observed",
    category: "analysis",
    title: "Embedded dependency inventory",
    detail: `Observed ${entities.length} dependency entries. Edges are not reported because the output shape did not establish them.`,
    evidence: [{ source: "rea" }],
  });

  return {
    findings,
    graph: { entities, edges: [] },
    summary: {
      dependencies: entities.length,
      normalized_entities: entities.length,
      normalized_edges: 0,
    },
  };
}

function normalizeTypes(raw: unknown): Normalized {
  const source = sourceOf(raw);
  const types = findArrayDeep(source, ["types", "members"], 4) ?? [];
  const entities: Entity[] = [];
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const type of types) {
    const name = isRecord(type)
      ? firstString(type, ["full_name", "name", "namespace"])
      : typeof type === "string"
        ? type
        : null;
    if (!name) continue;
    const id = clip(name, 300);
    if (seen.has(id)) continue;
    if (entities.length >= MAX_ENTITIES) break;
    seen.add(id);
    entities.push({ id, type: "type", label: clip(name, 300) });
    if (findings.length < MAX_FINDINGS - 1) {
      findings.push({
        class: "observed",
        category: "type",
        title: `Type: ${clip(name, 400)}`,
        evidence: [{ source: "rea", path: name }],
      });
    }
  }

  if (entities.length === 0) {
    return emptyResult(
      "inspect_managed_artifact",
      "REA completed, but no managed type inventory was recognized. Raw evidence is preserved.",
    );
  }

  findings.push({
    class: "observed",
    category: "analysis",
    title: "Managed assembly inventory",
    detail: `Observed ${entities.length} declared types.`,
    evidence: [{ source: "rea" }],
  });

  return {
    findings,
    graph: { entities, edges: [] },
    summary: {
      types: entities.length,
      normalized_entities: entities.length,
      normalized_edges: 0,
    },
  };
}

export function normalizeReaOutput(workflow: WorkflowName, raw: unknown): Normalized {
  const envelopeGraph = normalizeEvidenceGraph(workflow, raw);
  if (envelopeGraph) {
    return {
      ...envelopeGraph,
      summary: { ...envelopeGraph.summary, workflow },
    };
  }

  const result =
    workflow === "analyze_javascript_application"
      ? normalizeModules(raw)
      : workflow === "inspect_sqlite_database"
        ? normalizeTables(raw)
        : workflow === "inspect_go_binary" || workflow === "inspect_rust_binary"
          ? normalizeDependencies(workflow, raw)
          : normalizeTypes(raw);

  return {
    ...result,
    findings: result.findings.slice(0, MAX_FINDINGS),
    graph: {
      entities: result.graph.entities.slice(0, MAX_ENTITIES),
      edges: result.graph.edges.slice(0, MAX_EDGES),
    },
    summary: { ...result.summary, workflow },
  };
}
