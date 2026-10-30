import { spawn } from "node:child_process";
import { access, open, opendir, readFile, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNotHomeDirectory } from "./target-scope.js";

export const TARGET_KINDS = [
  "javascript_application",
  "managed_artifact",
  "sqlite_database",
  "go_binary",
  "rust_binary",
] as const;

export type TargetKind = (typeof TARGET_KINDS)[number];

export const WORKFLOW_BY_TARGET_KIND: Record<TargetKind, string> = {
  javascript_application: "analyze_javascript_application",
  managed_artifact: "inspect_managed_artifact",
  sqlite_database: "inspect_sqlite_database",
  go_binary: "inspect_go_binary",
  rust_binary: "inspect_rust_binary",
};

export const TARGET_KIND_LABELS: Record<TargetKind, string> = {
  javascript_application: "JavaScript application folder",
  managed_artifact: "Managed artifact file",
  sqlite_database: "SQLite database file",
  go_binary: "Go binary file",
  rust_binary: "Rust binary file",
};

const WORKFLOW_ALIASES: Record<string, TargetKind> = Object.fromEntries(
  (Object.entries(WORKFLOW_BY_TARGET_KIND) as [TargetKind, string][]).map(
    ([kind, workflow]) => [workflow, kind],
  ),
);

const SQLITE_HEADER = Buffer.from("SQLite format 3\u0000");
const MAX_PICKER_BYTES = 16 * 1024;

export function isTargetKind(value: string): value is TargetKind {
  return (TARGET_KINDS as readonly string[]).includes(value);
}

export function normalizeTargetKind(value: string | undefined): TargetKind | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (isTargetKind(trimmed)) return trimmed;
  return WORKFLOW_ALIASES[trimmed] ?? null;
}

export function targetKindLabel(kind: string): string {
  return isTargetKind(kind) ? TARGET_KIND_LABELS[kind] : kind.replaceAll("_", " ");
}

function isInsideOrEqual(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

async function amethystAppDir(): Promise<string | null> {
  const configured = process.env.AMETHYST_APP_DIR?.trim();
  if (configured) {
    try {
      return await realpath(configured);
    } catch {
      return null;
    }
  }

  const moduleDir = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [join(moduleDir, ".."), join(moduleDir, "..", "..")]) {
    try {
      const manifest = JSON.parse(
        await readFile(join(candidate, "package.json"), "utf8"),
      ) as { name?: unknown };
      if (manifest.name === "amethyst") return await realpath(candidate);
    } catch {
      // Keep looking; the companion can run outside the main repository.
    }
  }
  return null;
}

function isSqlite(header: Buffer): boolean {
  return header.length >= SQLITE_HEADER.length &&
    header.subarray(0, SQLITE_HEADER.length).equals(SQLITE_HEADER);
}

function isPe(header: Buffer): boolean {
  return header.length >= 2 && header[0] === 0x4d && header[1] === 0x5a;
}

function isElf(header: Buffer): boolean {
  return header.length >= 4 &&
    header[0] === 0x7f &&
    header[1] === 0x45 &&
    header[2] === 0x4c &&
    header[3] === 0x46;
}

function isMachO(header: Buffer): boolean {
  if (header.length < 4) return false;
  const be = header.readUInt32BE(0);
  const le = header.readUInt32LE(0);
  const magics = [
    0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca,
  ];
  return magics.includes(be) || magics.includes(le);
}

async function readHeader(path: string, length = 16): Promise<Buffer> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function inferTargetKind(realPath: string): Promise<TargetKind | null> {
  const info = await stat(realPath);
  if (info.isDirectory()) return "javascript_application";
  if (!info.isFile()) return null;

  const header = await readHeader(realPath);
  if (isSqlite(header)) return "sqlite_database";
  if (isPe(header)) return "managed_artifact";
  return null;
}

async function directoryHasEntries(path: string): Promise<boolean> {
  const directory = await opendir(path);
  try {
    const entry = await directory.read();
    return Boolean(entry);
  } finally {
    await directory.close().catch(() => undefined);
  }
}

export type SelectedTarget = {
  kind: TargetKind;
  workflow: string;
  realPath: string;
  label: string;
  isSymlink: boolean;
  sizeBytes: number | null;
};

export async function validateSelectedTarget(input: {
  path: string;
  kind?: string;
  appDir?: string | null;
}): Promise<SelectedTarget> {
  const rawPath = input.path.trim();
  if (!rawPath || rawPath.includes("\u0000")) {
    throw new Error("Selection is empty or invalid");
  }
  if (!isAbsolute(rawPath)) {
    throw new Error("Selected path must be absolute");
  }

  let realPath: string;
  try {
    realPath = await realpath(rawPath);
  } catch {
    throw new Error("Selected path does not exist");
  }

  const info = await stat(realPath);
  if (!info.isFile() && !info.isDirectory()) {
    throw new Error("Selected path must be a regular file or directory");
  }

  if (realPath === dirname(realPath)) {
    throw new Error("Refusing to use a filesystem root as an analysis target");
  }
  assertNotHomeDirectory(realPath);

  try {
    await access(realPath, constants.R_OK);
  } catch {
    throw new Error("Selected path is not readable by this user");
  }

  const appDir = input.appDir === undefined ? await amethystAppDir() : input.appDir;
  if (appDir && isInsideOrEqual(realPath, appDir)) {
    throw new Error("Refusing to analyze the Amethyst application directory");
  }

  let kind = normalizeTargetKind(input.kind);
  if (!kind) {
    kind = await inferTargetKind(realPath);
    if (!kind) {
      throw new Error(
        "Unable to infer the target kind. Pass --kind with one of: " + TARGET_KINDS.join(", "),
      );
    }
  }

  if (kind === "javascript_application") {
    if (!info.isDirectory()) {
      throw new Error("A JavaScript application target must be a directory");
    }
    if (!(await directoryHasEntries(realPath))) {
      throw new Error("Selected folder is empty");
    }
  } else {
    if (!info.isFile()) {
      throw new Error(`${targetKindLabel(kind)} must be a regular file`);
    }

    const header = await readHeader(realPath);
    if (kind === "sqlite_database" && !isSqlite(header)) {
      throw new Error("Selected file is not a SQLite database");
    }
    if (kind === "managed_artifact" && !isPe(header)) {
      throw new Error("Selected file is not a PE/CLI managed artifact");
    }
    if (
      (kind === "go_binary" || kind === "rust_binary") &&
      !isElf(header) &&
      !isMachO(header) &&
      !isPe(header)
    ) {
      throw new Error("Selected file is not an ELF, Mach-O, or PE executable");
    }
  }

  return {
    kind,
    workflow: WORKFLOW_BY_TARGET_KIND[kind],
    realPath,
    label: basename(realPath) || targetKindLabel(kind),
    isSymlink: resolve(rawPath) !== realPath,
    sizeBytes: info.isFile() ? info.size : null,
  };
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function findPickerPath(name: string): Promise<string | null> {
  const pathEntries = (process.env.PATH ?? "").split(":").filter(Boolean);
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ""] : [""];
  for (const entry of pathEntries) {
    for (const extension of extensions) {
      const candidate = join(entry, `${name}${extension}`);
      if (await isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

type PickerName = "zenity" | "kdialog" | "yad" | "osascript";

function pickerInvocation(picker: PickerName, kind: TargetKind): string[] {
  const wantsDirectory = kind === "javascript_application";
  const title = `Amethyst: select ${wantsDirectory ? "an application folder" : "a target file"}`;

  if (picker === "kdialog") {
    return wantsDirectory
      ? ["--getexistingdirectory", homedir(), "--title", title]
      : ["--getopenfilename", homedir(), "--title", title];
  }
  if (picker === "osascript") {
    return [
      "-e",
      wantsDirectory
        ? `POSIX path of (choose folder with prompt "${title}")`
        : `POSIX path of (choose file with prompt "${title}")`,
    ];
  }
  return wantsDirectory
    ? ["--file-selection", "--directory", `--title=${title}`]
    : ["--file-selection", `--title=${title}`];
}

function runPicker(command: string, args: string[]): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1" },
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: { code: number; stdout: string; stderr: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(result);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (settled) return;
      settled = true;
      reject(new Error("Folder picker timed out"));
    }, 5 * 60_000);

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < MAX_PICKER_BYTES) {
        stdout += chunk.toString("utf8").slice(0, MAX_PICKER_BYTES - stdout.length);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_PICKER_BYTES) {
        stderr += chunk.toString("utf8").slice(0, MAX_PICKER_BYTES - stderr.length);
      }
    });
    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("Unable to launch the folder picker"));
    });
    child.on("close", (code) => {
      finish({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

const PICKERS: readonly PickerName[] =
  process.platform === "darwin"
    ? ["osascript"]
    : ["zenity", "kdialog", "yad"];

export async function detectPicker(): Promise<{
  name: PickerName;
  path: string;
} | null> {
  for (const picker of PICKERS) {
    const executable = await findPickerPath(picker);
    if (executable) return { name: picker, path: executable };
  }
  return null;
}

export async function pickLocalPath(kind: TargetKind): Promise<string | null> {
  for (const picker of PICKERS) {
    const executable = await findPickerPath(picker);
    if (!executable) continue;
    const result = await runPicker(executable, pickerInvocation(picker, kind));
    if (result.code === 0 && result.stdout) return result.stdout;
    if (result.code === 1) return null;
    throw new Error(
      result.stderr || `The ${picker} picker exited with status ${result.code}`,
    );
  }

  throw new Error(
    process.platform === "darwin"
      ? "The macOS folder picker is unavailable. Rerun with --path <absolute path>."
      : "No native folder picker found. Install zenity (sudo apt install zenity) or rerun with --path <absolute path>.",
  );
}
