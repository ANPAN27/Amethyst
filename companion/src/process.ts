import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";

export type WorkflowName =
  | "analyze_javascript_application"
  | "inspect_managed_artifact"
  | "inspect_sqlite_database"
  | "inspect_go_binary"
  | "inspect_rust_binary";

export const WORKFLOWS: WorkflowName[] = [
  "analyze_javascript_application",
  "inspect_managed_artifact",
  "inspect_sqlite_database",
  "inspect_go_binary",
  "inspect_rust_binary",
];

const COMMAND_BY_WORKFLOW: Record<WorkflowName, string> = {
  analyze_javascript_application: "analyze-javascript-application",
  inspect_managed_artifact: "inspect-managed-artifact",
  inspect_sqlite_database: "inspect-sqlite-database",
  inspect_go_binary: "inspect-go-binary",
  inspect_rust_binary: "inspect-rust-binary",
};

export type JobParams = {
  table?: string;
};

export type RunResult = {
  durationMs: number;
  bytes: number;
  command: string[];
};

function reaCommand(): { command: string; prefix: string[] } {
  const configured = process.env.REA_BIN;
  if (configured && configured.trim()) {
    return { command: configured.trim(), prefix: [] };
  }
  return {
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    prefix: ["-y", process.env.REA_PACKAGE ?? "rea-agents@6.7.0"],
  };
}

export function buildReaArgs(
  workflow: WorkflowName,
  targetPath: string,
  params: JobParams,
): { command: string; args: string[] } {
  const { command, prefix } = reaCommand();
  const args = [...prefix, COMMAND_BY_WORKFLOW[workflow], targetPath];

  if (workflow === "inspect_sqlite_database" && params.table) {
    args.push("--table", params.table);
  }
  args.push("--json");

  return { command, args };
}

function clean(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}

function reaFailureMessage(
  stdoutHead: string,
  stderr: string,
  code: number | null,
  signal: NodeJS.Signals | null,
): string {
  try {
    const parsed = JSON.parse(stdoutHead) as unknown;
    if (typeof parsed === "object" && parsed !== null && "message" in parsed) {
      const message = (parsed as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) {
        return clean(message);
      }
    }
  } catch {
    // Fall back to stderr or the exit status below.
  }

  const safeStderr = clean(stderr);
  if (safeStderr) return safeStderr;
  return `REA exited with status ${code ?? "unknown"}${signal ? ` (${signal})` : ""}`;
}

/**
 * Runs an allowlisted REA command with an explicit executable and argument
 * array. No shell is involved and no user-supplied argument is interpolated.
 */
export async function runRea(input: {
  workflow: WorkflowName;
  targetPath: string;
  params: JobParams;
  outputPath: string;
  timeoutMs: number;
  maxOutputBytes: number;
}): Promise<RunResult> {
  const { command, args } = buildReaArgs(input.workflow, input.targetPath, input.params);
  const started = Date.now();

  return new Promise<RunResult>((resolve, reject) => {
    const detached = process.platform !== "win32";
    const child = spawn(command, args, {
      shell: false,
      detached,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1" },
    });

    const killChild = () => {
      if (detached && child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
          return;
        } catch {
          // Fall back to killing the direct child.
        }
      }
      child.kill("SIGKILL");
    };

    const output = createWriteStream(input.outputPath, { mode: 0o600 });
    let bytes = 0;
    let stderr = "";
    let stdoutHead = "";
    let settled = false;
    let exceeded = false;

    const timer = setTimeout(() => {
      if (!settled) {
        exceeded = true;
        killChild();
      }
    }, input.timeoutMs);

    const fail = async (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      output.destroy();
      await unlink(input.outputPath).catch(() => undefined);
      reject(error);
    };

    output.on("error", () => {
      killChild();
      void fail(new Error("Unable to write the REA output file"));
    });

    child.stdout.on("data", (chunk: Buffer) => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > input.maxOutputBytes) {
        killChild();
        void fail(new Error("REA output exceeded the artifact size limit"));
        return;
      }
      if (stdoutHead.length < 65_536) {
        stdoutHead += chunk.toString("utf8").slice(0, 65_536 - stdoutHead.length);
      }
      output.write(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 65_536) stderr += chunk.toString("utf8");
    });

    child.on("error", () => {
      void fail(new Error("Unable to start the REA executable. Set REA_BIN to a valid path."));
    });

    child.on("close", (code, signal) => {
      if (settled) return;

      if (exceeded) {
        void fail(new Error("REA analysis timed out"));
        return;
      }
      if (code !== 0) {
        void fail(new Error(reaFailureMessage(stdoutHead, stderr, code, signal)));
        return;
      }

      settled = true;
      clearTimeout(timer);
      output.end(() => {
        resolve({
          durationMs: Date.now() - started,
          bytes,
          command: [command, ...args],
        });
      });
    });
  });
}
