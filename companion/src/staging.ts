import { cp, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

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

/**
 * REA's JavaScript inventory walks dependency and build directories that are
 * usually present in a checkout. For a source application those directories
 * can dwarf the application code and produce artifacts above the server cap.
 * Analyze a temporary source-only snapshot when such directories exist.
 *
 * Regular artifacts (ASAR files, extracted bundles) are analyzed in place.
 */
export async function stageJavaScriptTarget(
  workflow: string,
  targetPath: string,
  temporaryDirectory: string,
): Promise<AnalysisScope> {
  if (workflow !== "analyze_javascript_application") {
    return { path: targetPath, staged: false, excluded: [] };
  }

  const info = await stat(targetPath);
  if (!info.isDirectory()) {
    return { path: targetPath, staged: false, excluded: [] };
  }

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
