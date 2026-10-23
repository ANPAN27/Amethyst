import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stageJavaScriptTarget } from "../companion/src/staging";

const created: string[] = [];

async function workspace() {
  const dir = await mkdtemp(join(tmpdir(), "amethyst-staging-"));
  created.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("companion JavaScript analysis scope", () => {
  it("stages application sources without dependencies or build output", async () => {
    const root = await workspace();
    const target = join(root, "app");
    await mkdir(join(target, "src"), { recursive: true });
    await mkdir(join(target, "node_modules", "dep"), { recursive: true });
    await mkdir(join(target, ".next", "server"), { recursive: true });
    await mkdir(join(target, ".git"), { recursive: true });
    await writeFile(join(target, "package.json"), "{}\n");
    await writeFile(join(target, "src", "index.js"), "export const answer = 42;\n");
    await writeFile(join(target, "node_modules", "dep", "index.js"), "module.exports = 1;\n");
    await writeFile(join(target, ".next", "server", "page.js"), "module.exports = 2;\n");
    await writeFile(join(target, ".git", "config"), "[core]\n");

    const scope = await stageJavaScriptTarget(
      "analyze_javascript_application",
      target,
      join(root, "temporary"),
    );

    expect(scope.staged).toBe(true);
    expect(scope.excluded).toEqual([".git", ".next", "node_modules"]);
    expect(scope.path).not.toBe(target);
    await expect(stat(join(scope.path, "src", "index.js"))).resolves.toBeTruthy();
    await expect(stat(join(scope.path, "node_modules"))).rejects.toThrow();
    await expect(stat(join(scope.path, ".next"))).rejects.toThrow();
  });

  it("rejects broad targets before copying any files", async () => {
    const root = await workspace();
    const target = join(root, "home");
    await mkdir(target);
    await writeFile(join(target, "one.js"), "export {};\n");
    await writeFile(join(target, "two.js"), "export {};\n");
    await writeFile(join(target, "three.js"), "export {};\n");
    const temporary = join(root, "temporary");

    await expect(
      stageJavaScriptTarget("analyze_javascript_application", target, temporary, {
        maxFiles: 2,
        maxBytes: 1024,
      }),
    ).rejects.toThrow(/too broad/);
    await expect(stat(join(temporary, "source"))).rejects.toThrow();
  });

  it("does not count excluded dependency trees toward the staging budget", async () => {
    const root = await workspace();
    const target = join(root, "app");
    await mkdir(join(target, "node_modules", "dep"), { recursive: true });
    await mkdir(join(target, "src"), { recursive: true });
    await writeFile(join(target, "src", "index.js"), "export {};\n");
    for (let index = 0; index < 5; index += 1) {
      await writeFile(join(target, "node_modules", "dep", `${index}.js`), "module.exports = 1;\n");
    }

    const scope = await stageJavaScriptTarget(
      "analyze_javascript_application",
      target,
      join(root, "temporary"),
      { maxFiles: 2, maxBytes: 1024 },
    );

    expect(scope.staged).toBe(true);
    await expect(stat(join(scope.path, "src", "index.js"))).resolves.toBeTruthy();
    await expect(stat(join(scope.path, "node_modules"))).rejects.toThrow();
  });

  it("rejects a target whose retained bytes exceed the staging budget", async () => {
    const root = await workspace();
    const target = join(root, "app");
    await mkdir(target);
    await writeFile(join(target, "index.js"), "export const answer = 42;\n");

    await expect(
      stageJavaScriptTarget("analyze_javascript_application", target, join(root, "temporary"), {
        maxFiles: 10,
        maxBytes: 8,
      }),
    ).rejects.toThrow(/too broad/);
  });

  it("analyzes directories without dependency or build folders in place", async () => {
    const root = await workspace();
    const target = join(root, "app");
    await mkdir(join(target, "src"), { recursive: true });
    await writeFile(join(target, "src", "index.js"), "export {};\n");

    const scope = await stageJavaScriptTarget(
      "analyze_javascript_application",
      target,
      join(root, "temporary"),
    );

    expect(scope).toEqual({ path: target, staged: false, excluded: [] });
  });

  it("does not stage file artifacts or other workflows", async () => {
    const root = await workspace();
    const target = join(root, "bundle.asar");
    await writeFile(target, "not a real asar");
    const temporary = join(root, "temporary");

    await expect(
      stageJavaScriptTarget("analyze_javascript_application", target, temporary),
    ).resolves.toEqual({ path: target, staged: false, excluded: [] });
    await expect(
      stageJavaScriptTarget("inspect_go_binary", root, temporary),
    ).resolves.toEqual({ path: root, staged: false, excluded: [] });
  });
});
