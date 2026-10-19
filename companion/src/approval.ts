import { realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { CompanionConfig } from "./config.js";

export type ApprovalResult = {
  approved: boolean;
  realPath: string | null;
  reason?: string;
};

type ApprovalConfig = Pick<CompanionConfig, "approved_paths">;

export async function validateTargetPath(path: string): Promise<string> {
  if (!path || path.includes("\u0000")) {
    throw new Error("Target path is empty or invalid");
  }
  if (!isAbsolute(path)) {
    throw new Error("Target path must be absolute");
  }
  const resolved = await realpath(path);
  const info = await stat(resolved);
  if (!info.isFile() && !info.isDirectory()) {
    throw new Error("Target must be a regular file or directory");
  }
  return resolved;
}

/**
 * Local target access requires explicit approval. Approval is remembered per
 * real path and can be granted non-interactively with --yes.
 */
export async function approveTarget(input: {
  config: ApprovalConfig;
  path: string;
  autoApprove: boolean;
}): Promise<ApprovalResult> {
  let realPath: string;
  try {
    realPath = await validateTargetPath(input.path);
  } catch (error) {
    return {
      approved: false,
      realPath: null,
      reason: error instanceof Error ? error.message : "Invalid target path",
    };
  }

  if (input.config.approved_paths.includes(realPath) || input.autoApprove) {
    if (!input.config.approved_paths.includes(realPath)) {
      input.config.approved_paths.push(realPath);
    }
    return { approved: true, realPath };
  }

  if (!stdin.isTTY) {
    return {
      approved: false,
      realPath,
      reason: "Target requires approval; run interactively or pass --yes",
    };
  }

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(
      `\nThe Amethyst website requested local analysis of:\n  ${realPath}\nAllow this path? [y/N] `,
    );
    if (/^y(es)?$/i.test(answer.trim())) {
      input.config.approved_paths.push(realPath);
      return { approved: true, realPath };
    }
    return { approved: false, realPath, reason: "Target access was not approved locally" };
  } finally {
    rl.close();
  }
}
