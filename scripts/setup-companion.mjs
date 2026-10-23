import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const companionDir = join(repoRoot, "companion");
const cli = join(companionDir, "dist", "cli.js");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(args) {
  const result = spawnSync(npm, args, { cwd: companionDir, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(["install"]);
run(["run", "build"]);
chmodSync(cli, 0o755);

const binDir = join(homedir(), ".local", "bin");
mkdirSync(binDir, { recursive: true });
const link = join(binDir, process.platform === "win32" ? "amethyst-companion.cmd" : "amethyst-companion");
rmSync(link, { force: true });

if (process.platform === "win32") {
  writeFileSync(link, `@echo off\r\nnode "${cli}" %*\r\n`);
} else {
  symlinkSync(cli, link);
}

const inPath = (process.env.PATH ?? "").split(":").includes(binDir);
console.log(`\nCompanion CLI installed: ${link}`);
console.log("Run it from any directory:");
console.log("  amethyst-companion pair --server <url> --code <code>");
console.log("  amethyst-companion select --project <project-id>");
console.log("  amethyst-companion run");
if (!inPath) {
  console.log(`\nAdd ${binDir} to PATH:`);
  console.log(`  export PATH="${binDir}:$PATH"`);
}
