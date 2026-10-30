#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, unlink } from "node:fs/promises";
import { hostname, platform, tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { ApiClient, CompanionApiError, normalizeServerUrl } from "./api.js";
import { configPath, loadConfig, saveConfig, type CompanionConfig } from "./config.js";
import { approveTarget, validateTargetPath } from "./approval.js";
import { WORKFLOWS, runRea, type JobParams, type WorkflowName } from "./process.js";
import { normalizeReaOutput } from "./normalize.js";
import { stageJavaScriptTarget } from "./staging.js";
import { TargetScopeError } from "./target-scope.js";
import {
  TARGET_KINDS,
  detectPicker,
  normalizeTargetKind,
  pickLocalPath,
  targetKindLabel,
  validateSelectedTarget,
} from "./selection.js";

const VERSION = "0.1.0";
const DEFAULT_TIMEOUT_MS = 15 * 60_000;
const DEFAULT_MAX_ARTIFACT_BYTES = 25 * 1024 * 1024;

type Job = {
  id: string;
  project_id: string;
  workflow: string;
  params: JobParams;
  target: { id: string; kind: string; label: string; path: string } | null;
  created_at: string;
};

function usage(): void {
  console.log(`Amethyst companion ${VERSION}

Usage:
  amethyst-companion pair --server URL [--code CODE] [--name NAME]
  amethyst-companion select --project PROJECT_ID [--kind KIND] [--path PATH] [--label LABEL]
  amethyst-companion approve --path PATH
  amethyst-companion run [--once] [--interval SECONDS] [--yes]
  amethyst-companion status
  amethyst-companion doctor
  amethyst-companion revoke

select opens a native folder/file picker on this machine, validates the chosen
path, remembers local approval, and registers the target with the server.
Kinds: javascript_application, managed_artifact, sqlite_database, go_binary,
rust_binary. If --kind is omitted on a folder, JavaScript application is used.

Environment:
  REA_BIN                 Existing REA executable (default: npx -y rea-agents@6.7.0)
  REA_PACKAGE             Pinned rea-agents package when using npx
  AMETHYST_CONFIG         Config path (default: ~/.amethyst/companion.json)
  AMETHYST_JOB_TIMEOUT_MS Job timeout (default: 900000)
  AMETHYST_MAX_ARTIFACT_BYTES  Artifact cap (default: 26214400)
  AMETHYST_AUTO_APPROVE=1 Auto-approve target paths (use with care)

The companion only runs allowlisted REA commands. It never executes shell
strings or arbitrary commands supplied by the website.

Install or upgrade the companion from the download page in Amethyst Settings.
Run \`doctor\` if pairing, selection, or job claiming is not working.`);
}

function getFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";
  return message.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").slice(0, 800);
}

async function promptCode(): Promise<string> {
  if (!stdin.isTTY) throw new Error("Pass --code when running non-interactively");
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question("Pairing code: ")).trim();
  } finally {
    rl.close();
  }
}

async function commandPair(args: string[]): Promise<void> {
  const serverRaw =
    getFlag(args, "--server") ?? process.env.AMETHYST_SERVER_URL ?? undefined;
  if (!serverRaw) throw new Error("--server is required for the first pairing");

  const server = normalizeServerUrl(serverRaw);
  const code = getFlag(args, "--code") ?? (await promptCode());
  const name = getFlag(args, "--name") ?? hostname();

  const client = new ApiClient(server);
  const response = await client.pair({
    code,
    name,
    platform: `${platform()}-${process.arch}`,
    version: VERSION,
    capabilities: [...WORKFLOWS],
  });

  const config: CompanionConfig = {
    server_url: server,
    token: response.data.token,
    companion_id: response.data.companion.companion_id,
    name: response.data.companion.name ?? name,
    approved_paths: [],
  };
  await saveConfig(config);

  console.log(`Paired as "${config.name}".`);
  console.log(`Token stored with owner-only permissions at ${configPath()}.`);
}

async function submitFailure(
  client: ApiClient,
  job: Job,
  code: string,
  message: string,
): Promise<void> {
  try {
    await client.submitResult(job.id, {
      status: "failed",
      error: { code: code.slice(0, 80), message: safeMessage(message) },
    });
  } catch (error) {
    if (error instanceof CompanionApiError && error.status === 409) return;
    console.error(`Failed to report job ${job.id} failure: ${safeMessage(error)}`);
  }
}

function supportsSqliteWorkflow(): boolean {
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  return major >= 26 || (major === 24 && minor >= 15);
}

async function processJob(client: ApiClient, config: CompanionConfig, job: Job, autoApprove: boolean): Promise<void> {
  // `select` and `approve` may be run while the worker is already running.
  // Reload approvals so a newly approved path does not require a restart.
  const latestConfig = await loadConfig();
  if (latestConfig.companion_id !== config.companion_id) {
    await submitFailure(
      client,
      job,
      "LOCAL_CONFIG_CHANGED",
      "The local companion configuration changed while this job was queued",
    );
    return;
  }
  config = latestConfig;

  const workflow = job.workflow as WorkflowName;
  if (!WORKFLOWS.includes(workflow)) {
    await submitFailure(client, job, "UNSUPPORTED_WORKFLOW", `Unsupported workflow: ${job.workflow}`);
    return;
  }
  if (workflow === "inspect_sqlite_database" && !supportsSqliteWorkflow()) {
    await submitFailure(
      client,
      job,
      "NODE_VERSION_UNSUPPORTED",
      `SQLite inspection requires Node.js 24.15+ in the 24.x line or 26+; this companion is running ${process.versions.node}.`,
    );
    return;
  }
  if (!job.target?.path) {
    await submitFailure(client, job, "MISSING_TARGET", "The job has no analysis target");
    return;
  }

  const approval = await approveTarget({
    config,
    path: job.target.path,
    autoApprove: autoApprove || process.env.AMETHYST_AUTO_APPROVE === "1",
  });
  if (!approval.approved || !approval.realPath) {
    await submitFailure(
      client,
      job,
      approval.errorCode ?? "TARGET_NOT_APPROVED",
      approval.reason ?? "Target access was not approved",
    );
    return;
  }
  await saveConfig(config);

  console.log(`\nJob ${job.id}: ${workflow}`);
  console.log(`Target: ${approval.realPath}`);

  const timeoutMs = positiveInt(process.env.AMETHYST_JOB_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const maxArtifactBytes = positiveInt(
    process.env.AMETHYST_MAX_ARTIFACT_BYTES,
    DEFAULT_MAX_ARTIFACT_BYTES,
  );
  const tempDir = await mkdtemp(join(tmpdir(), "amethyst-"));
  const outputPath = join(tempDir, "evidence.json");

  try {
    await client.progress(job.id, 5, "Preparing analysis scope");

    const scope = await stageJavaScriptTarget(workflow, approval.realPath, tempDir);
    if (scope.staged) {
      console.log(`Excluded from analysis: ${scope.excluded.join(", ")}`);
    }

    await client.progress(job.id, 10, "Starting REA");

    const run = await runRea({
      workflow,
      targetPath: scope.path,
      params: job.params ?? {},
      outputPath,
      timeoutMs,
      maxOutputBytes: maxArtifactBytes,
    });

    await client.progress(job.id, 60, "Normalizing evidence");

    const info = await stat(outputPath);
    if (info.size <= 0) throw new Error("REA produced no output");
    if (info.size > maxArtifactBytes) throw new Error("Artifact exceeds the size limit");

    const content = await readFile(outputPath);
    let parsed: unknown;
    try {
      parsed = JSON.parse(content.toString("utf8")) as unknown;
    } catch {
      await submitFailure(
        client,
        job,
        "INVALID_REA_OUTPUT",
        "REA did not produce valid JSON; no findings were submitted",
      );
      return;
    }

    const normalized = normalizeReaOutput(workflow, parsed);
    const sha256 = createHash("sha256").update(content).digest("hex");

    const upload = await client.requestUploadUrl(job.id);
    if (content.byteLength > upload.data.max_bytes) {
      throw new Error("Artifact exceeds the server size limit");
    }

    await client.progress(job.id, 75, "Uploading raw evidence");
    await client.uploadArtifact(upload.data.signed_url, content);

    await client.progress(job.id, 90, "Submitting results");
    await client.submitResult(job.id, {
      status: "succeeded",
      summary: {
        ...normalized.summary,
        analysis_scope: scope.staged ? "source_only_staged" : "target",
        ...(scope.staged ? { excluded_directories: scope.excluded } : {}),
        duration_ms: run.durationMs,
        rea_version: process.env.REA_VERSION ?? null,
        artifact_bytes: content.byteLength,
      },
      findings: normalized.findings,
      graph: normalized.graph,
      artifact: {
        path: upload.data.path,
        sha256,
        size_bytes: content.byteLength,
      },
      rea: {
        workflow,
        duration_ms: run.durationMs,
        version: process.env.REA_VERSION ?? undefined,
      },
    });

    console.log(
      `Job ${job.id} succeeded: ${normalized.findings.length} findings, ` +
        `${normalized.graph.entities.length} entities, ${normalized.graph.edges.length} edges.`,
    );
  } catch (error) {
    if (error instanceof CompanionApiError && error.status === 409) {
      console.log(`Job ${job.id} is no longer open.`);
      return;
    }
    const code =
      error instanceof TargetScopeError
        ? error.code
        : error instanceof Error && /timed out/i.test(error.message)
          ? "REA_TIMEOUT"
          : "ANALYSIS_FAILED";
    await submitFailure(client, job, code, safeMessage(error));
    console.error(`Job ${job.id} failed: ${safeMessage(error)}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function commandRun(args: string[]): Promise<void> {
  const config = await loadConfig();
  const client = new ApiClient(config.server_url, config.token);
  const once = hasFlag(args, "--once");
  const autoApprove = hasFlag(args, "--yes");
  const intervalSeconds = Math.min(
    60,
    Math.max(2, positiveInt(getFlag(args, "--interval"), 5)),
  );

  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
    console.log("\nStopping after the current job...");
  });

  console.log(`Companion "${config.name}" connected to ${config.server_url}`);
  console.log(`Workflows: ${WORKFLOWS.join(", ")}`);

  while (!stopping) {
    let job: Job | null = null;
    try {
      const response = await client.claimJob<{ data: { job: Job | null } }>();
      job = response.data.job;
    } catch (error) {
      if (error instanceof CompanionApiError && error.status === 401) {
        throw new Error("Companion credentials were rejected. Re-pair this companion.");
      }
      console.error(`Claim failed: ${safeMessage(error)}`);
    }

    if (job) {
      await processJob(client, config, job, autoApprove);
      if (once) break;
      continue;
    }

    if (once) break;
    await sleep(intervalSeconds * 1000);
  }
}

async function commandSelect(args: string[]): Promise<void> {
  const projectId = getFlag(args, "--project");
  if (!projectId) {
    throw new Error("--project PROJECT_ID is required");
  }

  const requestedKind = normalizeTargetKind(getFlag(args, "--kind"));
  if (getFlag(args, "--kind") && !requestedKind) {
    throw new Error(`Unsupported target kind. Use one of: ${TARGET_KINDS.join(", ")}`);
  }
  const pickerKind = requestedKind ?? "javascript_application";

  const pathFlag = getFlag(args, "--path");
  const selectedPath = pathFlag ?? (await pickLocalPath(pickerKind));
  if (!selectedPath) {
    console.log("Selection cancelled.");
    return;
  }

  let selected: Awaited<ReturnType<typeof validateSelectedTarget>>;
  try {
    selected = await validateSelectedTarget({
      path: selectedPath,
      kind: requestedKind ?? undefined,
    });
  } catch (error) {
    throw new Error(
      error instanceof Error ? `${error.message}. Nothing was registered.` : "Invalid selection",
    );
  }

  const config = await loadConfig();
  const client = new ApiClient(config.server_url, config.token);
  const label = (getFlag(args, "--label") ?? selected.label).trim().slice(0, 200);
  if (!label) throw new Error("Target label cannot be empty");

  if (!config.approved_paths.includes(selected.realPath)) {
    config.approved_paths.push(selected.realPath);
    await saveConfig(config);
  }

  const response = await client.registerTarget({
    project_id: projectId,
    kind: selected.kind,
    label,
    target_path: selected.realPath,
    metadata: {
      selection: pathFlag ? "path_flag" : "native_picker",
      platform: `${platform()}-${process.arch}`,
      symlink_resolved: selected.isSymlink,
      size_bytes: selected.sizeBytes,
    },
  });

  console.log(`Selected ${targetKindLabel(selected.kind)}:`);
  console.log(`  ${selected.realPath}`);
  if (selected.isSymlink) console.log("  (symlink resolved before registration)");
  console.log(`Registered target ${response.data.target.id} as "${response.data.target.label}".`);
  console.log("Local approval is saved for this path.");
  console.log("Start the worker with: amethyst-companion run");
}

async function commandApprove(args: string[]): Promise<void> {
  const path = getFlag(args, "--path");
  if (!path) throw new Error("--path is required");

  const config = await loadConfig();
  const realPath = await validateTargetPath(path);
  if (!config.approved_paths.includes(realPath)) {
    config.approved_paths.push(realPath);
    await saveConfig(config);
  }
  console.log(`Approved local analysis of ${realPath}.`);
}

async function commandDoctor(): Promise<void> {
  let failures = 0;
  const pass = (message: string) => console.log(`  ok    ${message}`);
  const warn = (message: string) => console.log(`  warn  ${message}`);
  const fail = (message: string) => {
    failures += 1;
    console.log(`  fail  ${message}`);
  };

  console.log(`Amethyst companion ${VERSION} doctor`);
  console.log(`  node  ${process.versions.node} (${platform()}-${process.arch})`);

  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  if (major > 22 || (major === 22 && minor >= 19)) {
    pass("Node.js meets the 22.19+ requirement");
  } else {
    fail("Node.js 22.19 or newer is required");
  }

  const picker = await detectPicker();
  if (picker) pass(`Native picker available: ${picker.name}`);
  else warn("No native picker found; use select --path <absolute path>");

  let config: CompanionConfig;
  try {
    config = await loadConfig();
    pass(`Configuration found at ${configPath()}`);
  } catch (error) {
    fail(`Configuration is not ready: ${safeMessage(error)}`);
    console.log("\nRun `amethyst-companion pair --server URL --code CODE` first.");
    process.exitCode = 1;
    return;
  }

  console.log(`  server ${config.server_url}`);
  console.log(`  name   ${config.name}`);
  try {
    const client = new ApiClient(config.server_url, config.token);
    await client.me();
    pass("Server reachable and companion credentials accepted");
  } catch (error) {
    if (error instanceof CompanionApiError && error.status === 401) {
      fail("Server rejected this companion token; revoke and pair again");
    } else {
      fail(`Server check failed: ${safeMessage(error)}`);
    }
  }

  if (config.approved_paths.length === 0) {
    warn("No local target paths approved yet; run select or approve");
  } else {
    for (const path of config.approved_paths) {
      try {
        await stat(path);
        pass(`Approved target available: ${path}`);
      } catch {
        warn(`Approved target is missing: ${path}`);
      }
    }
  }

  if (process.env.REA_BIN) {
    try {
      await stat(process.env.REA_BIN);
      pass(`REA_BIN exists: ${process.env.REA_BIN}`);
    } catch {
      fail(`REA_BIN does not exist: ${process.env.REA_BIN}`);
    }
  } else {
    pass("REA will be resolved with npx rea-agents");
  }

  console.log(failures === 0 ? "\nDoctor found no blocking problems." : `\nDoctor found ${failures} problem(s).`);
  if (failures > 0) process.exitCode = 1;
}

async function commandStatus(): Promise<void> {
  const config = await loadConfig();
  const client = new ApiClient(config.server_url, config.token);
  const response = await client.me();
  console.log(JSON.stringify(response.data, null, 2));
}

async function commandRevoke(): Promise<void> {
  const config = await loadConfig();
  const client = new ApiClient(config.server_url, config.token);
  await client.revokeSelf();
  await unlink(configPath()).catch(() => undefined);
  console.log("Companion revoked and local credentials removed.");
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h" || command === "help") {
    usage();
    return;
  }

  switch (command) {
    case "pair":
      await commandPair(args);
      return;
    case "select":
      await commandSelect(args);
      return;
    case "approve":
      await commandApprove(args);
      return;
    case "run":
      await commandRun(args);
      return;
    case "status":
      await commandStatus();
      return;
    case "doctor":
      await commandDoctor();
      return;
    case "revoke":
      await commandRevoke();
      return;
    default:
      usage();
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(`Error: ${safeMessage(error)}`);
  process.exitCode = 1;
});
