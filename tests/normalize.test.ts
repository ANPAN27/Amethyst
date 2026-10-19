import { describe, expect, it } from "vitest";
import { normalizeReaOutput } from "../companion/src/normalize";

describe("normalizeReaOutput", () => {
  it("normalizes modules and import edges without inventing unknown targets", () => {
    const result = normalizeReaOutput("analyze_javascript_application", {
      modules: [
        { path: "src/a.ts", imports: ["./b", "external-lib"] },
        { path: "src/b.ts" },
      ],
      edges: [{ from: "src/a.ts", to: "src/b.ts", type: "IMPORTS" }],
    });

    expect(result.graph.entities.map((entity) => entity.id).sort()).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
    expect(result.graph.edges).toContainEqual({
      from: "src/a.ts",
      to: "src/b.ts",
      type: "IMPORTS",
    });
    expect(result.graph.edges).not.toContainEqual({
      from: "src/a.ts",
      to: "external-lib",
      type: "IMPORTS",
    });
    expect(result.summary.modules).toBe(2);
  });

  it("does not fabricate findings when the output shape is unknown", () => {
    const result = normalizeReaOutput("analyze_javascript_application", { something: "else" });

    expect(result.graph.entities).toEqual([]);
    expect(result.graph.edges).toEqual([]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.detail).toMatch(/did not contain a recognized module inventory/);
  });

  it("deduplicates tables", () => {
    const result = normalizeReaOutput("inspect_sqlite_database", {
      tables: [{ name: "users" }, { name: "users" }, "events"],
    });

    expect(result.graph.entities).toHaveLength(2);
    expect(result.findings.filter((finding) => finding.category === "table")).toHaveLength(2);
  });

  it("normalizes dependency inventories for native binaries", () => {
    const result = normalizeReaOutput("inspect_go_binary", {
      packages: [{ name: "main" }, { name: "internal/store" }],
    });

    expect(result.graph.entities.every((entity) => entity.type === "dependency")).toBe(true);
    expect(result.graph.edges).toEqual([]);
  });

  it("caps findings for hostile or enormous outputs", () => {
    const modules = Array.from({ length: 6000 }, (_, index) => ({ path: `m${index}.js` }));
    const result = normalizeReaOutput("analyze_javascript_application", { modules });

    expect(result.findings.length).toBeLessThanOrEqual(5000);
    expect(result.graph.entities.length).toBeLessThanOrEqual(5000);
  });
});

describe("normalizeReaOutput evidence envelopes", () => {
  it("reads the real REA normalized_result graph shape", () => {
    const result = normalizeReaOutput("analyze_javascript_application", {
      evidence_id: "ev_test",
      normalized_result: {
        graph: {
          nodes: [
            {
              node_id: "n_index",
              kind: "javascript-module",
              identity: { key: "sha:src/index.js" },
              observations: [
                {
                  label: "src/index.js",
                  properties: { semantic_role: "source-module", path: "src/index.js" },
                },
              ],
            },
            {
              node_id: "n_a",
              kind: "javascript-module",
              identity: { key: "sha:src/a.js" },
              observations: [
                {
                  label: "src/a.js",
                  properties: { semantic_role: "source-module", path: "src/a.js" },
                },
              ],
            },
          ],
          edges: [
            {
              source_node_id: "n_index",
              target_node_id: "n_a",
              relation: "imports",
            },
          ],
        },
        summary: { browser_windows: 0 },
        statistics: { relevant_files: 2 },
      },
    });

    expect(result.graph.entities).toHaveLength(2);
    expect(result.graph.entities[0]?.label).toBe("src/index.js");
    expect(result.graph.edges).toEqual([
      { from: "n_index", to: "n_a", type: "imports" },
    ]);
    expect(result.summary.modules).toBe(2);
    expect(result.summary.rea_summary).toEqual({ browser_windows: 0 });
    expect(result.findings.some((finding) => finding.title.includes("Module: src/a.js"))).toBe(true);
  });

  it("keeps identifiers and relationship references inside server limits", () => {
    const longId = "a".repeat(400);
    const otherId = "b".repeat(400);
    const result = normalizeReaOutput("analyze_javascript_application", {
      normalized_result: {
        graph: {
          nodes: [
            { node_id: longId, kind: "javascript-module", observations: [] },
            { node_id: otherId, kind: "javascript-module", observations: [] },
          ],
          edges: [
            {
              source_node_id: longId,
              target_node_id: otherId,
              relation: "r".repeat(120),
            },
          ],
        },
      },
    });

    expect(result.graph.entities).toHaveLength(2);
    expect(result.graph.entities.every((entity) => entity.id.length === 300)).toBe(true);
    expect(result.graph.edges).toHaveLength(1);
    expect(result.graph.edges[0]?.from).toHaveLength(300);
    expect(result.graph.edges[0]?.from.startsWith("a".repeat(299))).toBe(true);
    expect(result.graph.edges[0]?.to).toHaveLength(300);
    expect(result.graph.edges[0]?.to.startsWith("b".repeat(299))).toBe(true);
    expect(result.graph.edges[0]?.type).toHaveLength(80);
  });

  it("does not invent entities when an envelope has no graph", () => {
    const result = normalizeReaOutput("analyze_javascript_application", {
      normalized_result: { summary: { anything: true } },
    });

    expect(result.graph.entities).toEqual([]);
    expect(result.findings).toHaveLength(1);
  });
});
