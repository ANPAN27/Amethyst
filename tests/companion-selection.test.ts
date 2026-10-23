import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  inferTargetKind,
  normalizeTargetKind,
  validateSelectedTarget,
} from "../companion/src/selection";

const created: string[] = [];

async function workspace() {
  const dir = await mkdtemp(join(tmpdir(), "amethyst-selection-"));
  created.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("companion local target selection", () => {
  it("accepts a readable application folder outside the app directory", async () => {
    const root = await workspace();
    const app = join(root, "application");
    await mkdir(app);
    await writeFile(join(app, "index.js"), "export const answer = 42;\n");

    const result = await validateSelectedTarget({ path: app, appDir: join(root, "amethyst") });

    expect(result.kind).toBe("javascript_application");
    expect(result.workflow).toBe("analyze_javascript_application");
    expect(result.realPath).toBe(app);
    expect(result.label).toBe("application");
  });

  it("resolves symlinks before registration", async () => {
    const root = await workspace();
    const app = join(root, "real-app");
    const link = join(root, "linked-app");
    await mkdir(app);
    await writeFile(join(app, "package.json"), "{}\n");
    await symlink(app, link);

    const result = await validateSelectedTarget({ path: link, appDir: null });

    expect(result.realPath).toBe(app);
    expect(result.isSymlink).toBe(true);
  });

  it("rejects the Amethyst application directory", async () => {
    const root = await workspace();
    const inside = join(root, "src");
    await mkdir(inside);
    await writeFile(join(inside, "index.js"), "export {};\n");

    await expect(
      validateSelectedTarget({ path: inside, appDir: root }),
    ).rejects.toThrow(/Amethyst application directory/);
  });

  it("detects and rejects this repository by default", async () => {
    await expect(
      validateSelectedTarget({ path: process.cwd() }),
    ).rejects.toThrow(/Amethyst application directory/);
  });

  it("rejects the home directory as a JavaScript target", async () => {
    await expect(
      validateSelectedTarget({ path: homedir(), appDir: null }),
    ).rejects.toThrow(/home directory/);
  });

  it("rejects empty folders and missing paths", async () => {
    const root = await workspace();
    const empty = join(root, "empty");
    await mkdir(empty);

    await expect(
      validateSelectedTarget({ path: empty, appDir: null }),
    ).rejects.toThrow(/empty/);
    await expect(
      validateSelectedTarget({ path: join(root, "missing"), appDir: null }),
    ).rejects.toThrow(/does not exist/);
  });

  it("validates SQLite and executable magic bytes", async () => {
    const root = await workspace();
    const sqlite = join(root, "sample.sqlite");
    const text = join(root, "notes.txt");
    await writeFile(sqlite, Buffer.from("SQLite format 3\u0000rest of header", "binary"));
    await writeFile(text, "not an executable");

    await expect(
      validateSelectedTarget({ path: sqlite, appDir: null }),
    ).resolves.toMatchObject({ kind: "sqlite_database" });
    await expect(
      validateSelectedTarget({ path: text, kind: "sqlite_database", appDir: null }),
    ).rejects.toThrow(/SQLite/);
    await expect(
      validateSelectedTarget({ path: text, kind: "go_binary", appDir: null }),
    ).rejects.toThrow(/ELF/);
  });

  it("infers directories and SQLite files", async () => {
    const root = await workspace();
    const app = join(root, "app");
    const sqlite = join(root, "sample.db");
    await mkdir(app);
    await writeFile(join(app, "index.js"), "export {};\n");
    await writeFile(sqlite, Buffer.from("SQLite format 3\u0000rest", "binary"));

    expect(await inferTargetKind(app)).toBe("javascript_application");
    expect(await inferTargetKind(sqlite)).toBe("sqlite_database");
  });

  it("accepts workflow aliases for --kind", () => {
    expect(normalizeTargetKind("analyze_javascript_application")).toBe(
      "javascript_application",
    );
    expect(normalizeTargetKind("inspect_go_binary")).toBe("go_binary");
    expect(normalizeTargetKind("run_anything")).toBeNull();
  });
});
