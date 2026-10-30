import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const companionDir = join(repoRoot, "companion");
const downloadsDir = join(repoRoot, "public", "downloads");
const manifest = JSON.parse(readFileSync(join(companionDir, "package.json"), "utf8"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

if (manifest.name !== "amethyst-companion" || typeof manifest.version !== "string") {
  throw new Error("companion/package.json does not describe the Amethyst companion");
}
if (manifest.private) {
  throw new Error("companion/package.json must not be private when producing a release");
}

mkdirSync(downloadsDir, { recursive: true });

const packOutput = execFileSync(
  npm,
  ["pack", companionDir, "--pack-destination", downloadsDir, "--json"],
  { cwd: repoRoot, encoding: "utf8" },
).trim();
const packed = JSON.parse(packOutput)[0];
if (!packed?.filename) throw new Error("npm pack did not return a tarball filename");

const tarballPath = join(downloadsDir, packed.filename);
const tarball = readFileSync(tarballPath);
const checksum = createHash("sha256").update(tarball).digest("hex");
writeFileSync(
  `${tarballPath}.sha256`,
  `${checksum}  ${packed.filename}\n`,
  { mode: 0o644 },
);

const installerSource = readFileSync(join(companionDir, "install.sh"), "utf8");
if (!installerSource.includes("__AMETHYST_COMPANION_VERSION__")) {
  throw new Error("The companion installer is missing its version placeholder");
}
const installer = installerSource.replaceAll(
  "__AMETHYST_COMPANION_VERSION__",
  manifest.version,
);
if (installer.includes("__AMETHYST_COMPANION_VERSION__")) {
  throw new Error("The companion installer version placeholder was not replaced");
}

const installerPath = join(downloadsDir, "install-amethyst-companion.sh");
writeFileSync(installerPath, installer, { mode: 0o755 });
chmodSync(installerPath, 0o755);

console.log(`Companion release v${manifest.version} built.`);
console.log(`  Tarball:   ${tarballPath}`);
console.log(`  Checksum:  ${tarballPath}.sha256`);
console.log(`  Installer: ${installerPath}`);
console.log("\nDeploy the `public/downloads` directory with the Amethyst web app.");
