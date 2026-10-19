import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { approveTarget, validateTargetPath } from "../companion/src/approval";
import { normalizeServerUrl } from "../companion/src/api";
import { buildReaArgs } from "../companion/src/process";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("companion target approval", () => {
  it("rejects relative and missing paths", async () => {
    await expect(validateTargetPath("relative/path")).rejects.toThrow(/absolute/);
    await expect(validateTargetPath("/does/not/exist/amethyst")).rejects.toThrow();
  });

  it("remembers explicit non-interactive approval per real path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "amethyst-approval-"));
    created.push(dir);
    const file = join(dir, "sample.js");
    await writeFile(file, "export const x = 1;\n");

    const config = { approved_paths: [] as string[] };
    const result = await approveTarget({ config, path: file, autoApprove: true });

    expect(result.approved).toBe(true);
    expect(config.approved_paths).toContain(result.realPath);
  });
});

describe("REA command construction", () => {
  it("keeps workflow and parameters as separate argv entries", () => {
    const { args } = buildReaArgs("inspect_sqlite_database", "/tmp/app.db", {
      table: "users; rm -rf /",
    });

    expect(args).toContain("inspect-sqlite-database");
    expect(args).toContain("/tmp/app.db");
    expect(args).toContain("users; rm -rf /");
    expect(args.at(-1)).toBe("--json");
  });

  it("does not emit flags that the pinned REA release rejects", () => {
    const { args } = buildReaArgs("analyze_javascript_application", "/tmp/app", {
      table: "ignored",
    });

    expect(args).not.toContain("--detail");
    expect(args).not.toContain("--type");
    expect(args).not.toContain("--table");
  });
});

describe("companion server URL validation", () => {
  it("requires HTTPS for non-local servers", () => {
    expect(() => normalizeServerUrl("http://example.com")).toThrow(/HTTPS/);
    expect(normalizeServerUrl("http://localhost:3000/")).toBe("http://localhost:3000");
  });

  it("rejects embedded credentials and query strings", () => {
    expect(() => normalizeServerUrl("https://user:pass@example.com")).toThrow(/credentials/);
    expect(() => normalizeServerUrl("https://example.com/?token=1")).toThrow(/query/);
  });
});
