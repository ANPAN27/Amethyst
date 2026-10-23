import { ClientApiError } from "@/lib/client-api";

export const WORKFLOWS = [
  {
    value: "analyze_javascript_application",
    label: "JavaScript application",
    kind: "javascript_application",
    description: "Inspect a JavaScript application directory with REA.",
  },
  {
    value: "inspect_managed_artifact",
    label: "Managed artifact",
    kind: "managed_artifact",
    description: "Inspect a locally approved managed artifact.",
  },
  {
    value: "inspect_sqlite_database",
    label: "SQLite database",
    kind: "sqlite_database",
    description: "Inspect a SQLite schema, optionally limited to one table.",
  },
  {
    value: "inspect_go_binary",
    label: "Go binary",
    kind: "go_binary",
    description: "Inspect a compiled Go executable.",
  },
  {
    value: "inspect_rust_binary",
    label: "Rust binary",
    kind: "rust_binary",
    description: "Inspect a compiled Rust executable.",
  },
] as const;

export const TARGET_KINDS = WORKFLOWS.map((workflow) => workflow.kind);

export const FINDING_CLASSES = [
  "observed",
  "verified_relationship",
  "inferred",
  "ai_interpretation",
  "proposed_code",
] as const;

export const JOB_STATUSES = [
  "queued",
  "claimed",
  "running",
  "succeeded",
  "failed",
  "canceled",
] as const;

const WORKFLOW_LABELS: Record<string, string> = Object.fromEntries(
  WORKFLOWS.map((workflow) => [workflow.value, workflow.label]),
);

const TARGET_LABELS: Record<string, string> = Object.fromEntries(
  WORKFLOWS.map((workflow) => [workflow.kind, workflow.label]),
);

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  claimed: "Claimed",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  canceled: "Canceled",
  active: "Active",
  revoked: "Revoked",
  pending: "Pending",
  refunded: "Refunded",
  skipped: "Skipped",
  observed: "Observed",
  verified_relationship: "Verified relationship",
  inferred: "Inferred",
  ai_interpretation: "AI interpretation",
  proposed_code: "Proposed code",
  evidence: "Evidence",
  partial: "Partial",
  insufficient: "Insufficient",
  grant: "Grant",
  purchase: "Purchase",
  debit: "Debit",
  refund: "Refund",
  adjustment: "Adjustment",
};

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "live";

export function workflowLabel(workflow: string): string {
  return WORKFLOW_LABELS[workflow] ?? workflow.replaceAll("_", " ");
}

export function targetKindLabel(kind: string): string {
  return TARGET_LABELS[kind] ?? kind.replaceAll("_", " ");
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replaceAll("_", " ");
}

export function statusTone(status: string): StatusTone {
  if (["succeeded", "active", "evidence"].includes(status)) return "success";
  if (["failed", "revoked", "danger", "insufficient"].includes(status)) return "danger";
  if (["queued", "claimed", "partial", "pending", "refunded"].includes(status)) return "warning";
  if (status === "running") return "live";
  return "neutral";
}

export function formatMoney(amount: number | null, currency: string | null): string {
  if (amount === null) return "—";
  const code = currency?.toUpperCase() || "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${code}`;
  }
}

export function classTone(value: string): StatusTone {
  if (value === "verified_relationship" || value === "observed") return "success";
  if (value === "inferred" || value === "ai_interpretation") return "warning";
  if (value === "proposed_code") return "neutral";
  return "neutral";
}

export function isOpenJob(status: string): boolean {
  return ["queued", "claimed", "running"].includes(status);
}

export function isLiveJob(status: string): boolean {
  return status === "running";
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function shortId(value: string, length = 8): string {
  return value.length <= length ? value : value.slice(0, length);
}

export function confidenceLabel(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

export function formatClientError(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.status === 401) return "Your session has expired. Sign in again to continue.";
    if (error.code === "insufficient_credits") {
      return "Not enough credits for this operation. Review your usage balance.";
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "Unexpected error. Try again.";
}

export function safeNextPath(value: string | null | undefined, fallback = "/overview"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}

export function filterFindings<T extends {
  title: string;
  class: string;
  category: string | null;
  detail: string | null;
  project_id?: string;
  project_name?: string;
}>(
  findings: T[],
  input: { query?: string; findingClass?: string; projectId?: string },
): T[] {
  const query = input.query?.trim().toLowerCase() ?? "";
  return findings.filter((finding) => {
    if (input.findingClass && input.findingClass !== "all" && finding.class !== input.findingClass) {
      return false;
    }
    if (input.projectId && input.projectId !== "all" && finding.project_id !== input.projectId) {
      return false;
    }
    if (!query) return true;
    return [finding.title, finding.class, finding.category, finding.detail, finding.project_name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const safePage = Math.max(1, Math.floor(page));
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function totalPages(itemCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(itemCount / pageSize));
}

export function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function safeDownloadName(value: string, fallback = "amethyst-output.txt"): string {
  const base = value.split(/[/\\]/).pop() ?? "";
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 120);
  return cleaned || fallback;
}
