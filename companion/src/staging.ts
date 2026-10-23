import { cp, lstat, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { TargetScopeError } from "./target-scope.js";

const EXCLUDED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
  ".parcel-cache",
  ".pnpm-store",
]);

const DEFAULT_MAX_STAGE_FILES = 25_000;
const DEFAULT_MAX_STAGE_BYTES = 2 * 1024 * 1024 * 1024;

export type StagingLimits = {
  maxFiles: number;
  maxBytes: number;
};

export type AnalysisScope = {
  path: string;
  staged: boolean;
  excluded: string[];
};

function containsExcludedDirectory(relativePath: string): boolean {
  return relativePath.split(sep).some((part) => EXCLUDED_DIRECTORIES.has(part));
}

async function rootExcludedDirectories(targetPath: string): Promise<string[]> {
  const entries = await readdir(targetPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function stagingLimits(overrides?: Partial<StagingLimits>): StagingLimits {
  return {
    maxFiles:
      overrides?.maxFiles ??
      positiveInteger(process.env.AMETHYST_MAX_STAGE_FILES, DEFAULT_MAX_STAGE_FILES),
    maxBytes:
      overrides?.maxBytes ??
      positiveInteger(process.env.AMETHYST_MAX_STAGE_BYTES, DEFAULT_MAX_STAGE_BYTES),
  };
}

function scopeError(limits: StagingLimits): TargetScopeError {
  return new TargetScopeError(
    `Analysis target is too broad: more than ${limits.maxFiles.toLocaleString("en-US")} files ` +
      `or ${limits.maxBytes.toLocaleString("en-US")} bytes after excluding dependency/build ` +
      "directories. Select the application folder itself, not a parent or home directory. " +
      "Raise AMETHYST_MAX_STAGE_FILES or AMETHYST_MAX_STAGE_BYTES only if that scope is intentional.",
  );
}

async function assertSourceFits(targetPath: string, limits: StagingLimits): Promise<void> {
  const pending = [targetPath];
  let files = 0;
  let bytes = 0;

  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) continue;
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
          pending.push(join(directory, entry.name));
        }
        continue;
      }

      const info = await lstat(join(directory, entry.name));
      files += 1;
      bytes += info.size;
      if (files > limits.maxFiles || bytes > limits.maxBytes) {
        throw scopeError(limits);
      }
    }
  }
}

/**
 * REA's JavaScript inventory walks dependency and build directories that are
 * usually present in a checkout. For a source application those directories
 * can dwarf the application code and produce artifacts above the server cap.
 * Analyze a temporary source-only snapshot when such directories exist.
 *
 * A bounded inventory runs before any copy so a home or parent directory is
 * rejected quickly instead of filling the disk and sitting at 5% progress.
 * Regular artifacts (ASAR files, extracted bundles) are analyzed in place.
 */
export async function stageJavaScriptTarget(
  workflow: string,
  targetPath: string,
  temporaryDirectory: string,
  limitOverrides?: Partial<StagingLimits>,
): Promise<AnalysisScope> {
  if (workflow !== "analyze_javascript_application") {
    return { path: targetPath, staged: false, excluded: [] };
  }

  const info = await stat(targetPath);
  if (!info.isDirectory()) {
    return { path: targetPath, staged: false, excluded: [] };
  }

  await assertSourceFits(targetPath, stagingLimits(limitOverrides));

  const excluded = await rootExcludedDirectories(targetPath);
  if (excluded.length === 0) {
    return { path: targetPath, staged: false, excluded: [] };
  }

  const destination = join(temporaryDirectory, "source");
  await cp(targetPath, destination, {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true,
    filter: (source) => {
      if (source === targetPath) return true;
      return !containsExcludedDirectory(relative(targetPath, source));
    },
  });

  return { path: destination, staged: true, excluded };
}
