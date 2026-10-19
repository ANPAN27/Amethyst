import type { WORKFLOWS } from "@/lib/validation/schemas";

export type Workflow = (typeof WORKFLOWS)[number];

const TARGET_KIND_BY_WORKFLOW: Record<Workflow, string> = {
  analyze_javascript_application: "javascript_application",
  inspect_managed_artifact: "managed_artifact",
  inspect_sqlite_database: "sqlite_database",
  inspect_go_binary: "go_binary",
  inspect_rust_binary: "rust_binary",
};

export const TARGET_KINDS = Object.values(TARGET_KIND_BY_WORKFLOW);

export function targetKindForWorkflow(workflow: Workflow): string {
  return TARGET_KIND_BY_WORKFLOW[workflow];
}

export function workflowMatchesTargetKind(workflow: Workflow, targetKind: string): boolean {
  return TARGET_KIND_BY_WORKFLOW[workflow] === targetKind;
}

export const PUBLIC_JOB_FIELDS =
  "id, project_id, companion_id, target_id, workflow, status, progress, error_code, error_message, result_summary, created_at, claimed_at, started_at, finished_at";
