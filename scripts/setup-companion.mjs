import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const companionDir = join(repoRoot, "companion");
const companionCli = join(companionDir, "dist", "cli.js");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const installRoot = join(
  resolve(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share")),
  "amethyst-companion",
);
const binDir = join(homedir(), ".local", "bin");
const launcher = join(binDir, process.platform === "win32" ? "amethyst-companion.cmd" : "amethyst-companion");

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function run(args) {
  const result = spawnSync(npm, args, {
    cwd: companionDir,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function checkNodeVersion() {
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 19)) {
    fail(`Node.js 22.19 or newer is required; this command is running ${process.versions.node}.`);
  }
}

function verifyRepository() {
  let rootManifest;
  let companionManifest;
  try {
    rootManifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
    companionManifest = JSON.parse(readFileSync(join(companionDir, "package.json"), "utf8"));
  } catch (error) {
    fail(`This setup command must be run from the Amethyst repository: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (rootManifest.name !== "amethyst" || companionManifest.name !== "amethyst-companion") {
    fail("This setup command must be run from the Amethyst repository, not an analysis target.");
  }
  return companionManifest;
}

function buildCompanion() {
  run(["install"]);
  run(["run", "build"]);
  if (!existsSync(companionCli)) {
    fail(`The companion build did not produce ${companionCli}.`);
  }
}

function installFiles(companionManifest) {
  rmSync(installRoot, { recursive: true, force: true });
  mkdirSync(installRoot, { recursive: true, mode: 0o755 });
  cpSync(join(companionDir, "dist"), join(installRoot, "dist"), { recursive: true });
  cpSync(join(companionDir, "package.json"), join(installRoot, "package.json"));
  cpSync(join(companionDir, "README.md"), join(installRoot, "README.md"));
  writeFileSync(
    join(installRoot, "install.json"),
    `${JSON.stringify(
      {
        source_repo: repoRoot,
        version: companionManifest.version,
        installed_at: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    { mode: 0o644 },
  );
}

function writeLauncher() {
  mkdirSync(binDir, { recursive: true, mode: 0o755 });
  rmSync(launcher, { force: true });

  if (process.platform === "win32") {
    writeFileSync(
      launcher,
      `@echo off\r\nsetlocal\r\nif not exist "${join(installRoot, "dist", "cli.js")}" (\r\n  echo Amethyst companion installation is incomplete. Re-run npm run companion:setup from the Amethyst repository. 1>&2\r\n  exit /b 1\r\n)\r\nnode "${join(installRoot, "dist", "cli.js")}" %*\r\n`,
    );
    return;
  }

  const script = `#!/bin/sh
set -eu

install_root=${shellQuote(installRoot)}
cli="$install_root/dist/cli.js"
source_repo=${shellQuote(repoRoot)}

if [ ! -f "$cli" ]; then
  echo "Amethyst companion installation is incomplete: $cli" >&2
  echo "Re-run npm run companion:setup from the Amethyst repository." >&2
  exit 1
fi

if [ -z "\${AMETHYST_APP_DIR:-}" ] && [ -d "$source_repo" ]; then
  AMETHYST_APP_DIR="$source_repo"
  export AMETHYST_APP_DIR
fi

exec node "$cli" "$@"
`;
  writeFileSync(launcher, script, { mode: 0o755 });
  chmodSync(launcher, 0o755);
}

function report(companionManifest) {
  const inPath = (process.env.PATH ?? "").split(delimiter).includes(binDir);
  console.log(`\nAmethyst companion v${companionManifest.version} installed.`);
  console.log(`  Installation: ${installRoot}`);
  console.log(`  Launcher:     ${launcher}`);
  console.log("\nSetup is complete. Pair, select, and run from any directory:");
  console.log("  amethyst-companion pair --server <url> --code <code>");
  console.log("  amethyst-companion select --project <project-id> --kind javascript_application");
  console.log("  amethyst-companion run");

  if (!inPath) {
    console.log(`\n${binDir} is not on PATH in this shell. Add it permanently:`);
    console.log(`  echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc`);
    console.log("  source ~/.bashrc");
    console.log("For zsh, use ~/.zshrc instead of ~/.bashrc.");
    console.log(`Or invoke the launcher directly: ${launcher} --help`);
  }
}

checkNodeVersion();
const companionManifest = verifyRepository();
buildCompanion();
installFiles(companionManifest);
writeLauncher();
report(companionManifest);
