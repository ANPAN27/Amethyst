"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { IconPlay } from "@/components/icons";
import { Dialog } from "@/components/ui/dialog";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/client-api";
import type { CompanionRow, JobRow, TargetRow } from "@/lib/types";
import { WORKFLOWS, formatClientError } from "@/lib/ui";

export function QueueJobButton({
  projectId,
  targets,
  companions,
}: {
  projectId: string;
  targets: TargetRow[];
  companions: CompanionRow[];
}) {
  const [open, setOpen] = useState(false);
  const active = companions.filter((companion) => companion.status === "active");
  const disabled = targets.length === 0 || active.length === 0;

  return (
    <>
      <Button
        disabled={disabled}
        onClick={() => setOpen(true)}
        size="sm"
        title={
          disabled
            ? targets.length === 0
              ? "Add a target first"
              : "Pair an active companion first"
            : undefined
        }
      >
        <IconPlay size={13} />
        Analyze
      </Button>
      <QueueJobDialog
        companions={active}
        onClose={() => setOpen(false)}
        open={open}
        projectId={projectId}
        targets={targets}
      />
    </>
  );
}

function QueueJobDialog({
  open,
  onClose,
  projectId,
  targets,
  companions,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  targets: TargetRow[];
  companions: CompanionRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [workflow, setWorkflow] = useState<string>(WORKFLOWS[0].value);
  const [targetId, setTargetId] = useState("");
  const [companionId, setCompanionId] = useState("");
  const [table, setTable] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedWorkflow = WORKFLOWS.find((item) => item.value === workflow) ?? WORKFLOWS[0];
  const matchingTargets = useMemo(
    () => targets.filter((target) => target.kind === selectedWorkflow.kind),
    [selectedWorkflow.kind, targets],
  );
  const eligibleCompanions = useMemo(
    () => companions.filter((companion) => companion.capabilities.includes(workflow)),
    [companions, workflow],
  );

  useEffect(() => {
    if (!open) return;
    if (targets.some((target) => target.kind === selectedWorkflow.kind)) return;
    const fallback = WORKFLOWS.find((item) =>
      targets.some((target) => target.kind === item.kind),
    );
    if (fallback) setWorkflow(fallback.value);
  }, [open, selectedWorkflow.kind, targets]);

  const effectiveTarget = matchingTargets.some((target) => target.id === targetId)
    ? targetId
    : (matchingTargets[0]?.id ?? "");
  const effectiveCompanion = eligibleCompanions.some((companion) => companion.id === companionId)
    ? companionId
    : (eligibleCompanions[0]?.id ?? "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    if (!effectiveTarget || !effectiveCompanion) {
      setError("Select a matching target and an active companion with this capability.");
      setBusy(false);
      return;
    }

    try {
      const result = await apiRequest<{ job: JobRow }>(`/api/v1/projects/${projectId}/jobs`, {
        method: "POST",
        body: JSON.stringify({
          workflow,
          target_id: effectiveTarget,
          companion_id: effectiveCompanion,
          ...(workflow === "inspect_sqlite_database" && table.trim()
            ? { params: { table: table.trim() } }
            : {}),
          idempotency_key: crypto.randomUUID(),
        }),
      });
      toast.push({
        title: "Analysis queued",
        description: `Job ${result.job.id.slice(0, 8)} is waiting for the companion to run the real REA workflow.`,
        tone: "success",
      });
      onClose();
      router.refresh();
    } catch (caught) {
      setError(formatClientError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      description="Runs the allowlisted REA workflow on your paired companion. The server checks that target kind, workflow, and companion capability match."
      footer={
        <>
          <Button onClick={onClose} type="button" variant="secondary">
            Cancel
          </Button>
          <Button
            disabled={busy || !effectiveTarget || !effectiveCompanion}
            form="queue-job-form"
            type="submit"
          >
            {busy ? "Starting…" : "Start analysis"}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title="Run analysis"
    >
      <form className="stack" id="queue-job-form" onSubmit={submit}>
        {error ? (
          <div className="notice notice-danger" role="alert">
            <div className="notice-body">{error}</div>
          </div>
        ) : null}
        <Field htmlFor="job-workflow" label="Workflow">
          <Select
            id="job-workflow"
            onChange={(event) => {
              setWorkflow(event.target.value);
              setTargetId("");
              setCompanionId("");
            }}
            value={workflow}
          >
            {WORKFLOWS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          error={matchingTargets.length === 0 ? "No targets match this workflow." : undefined}
          hint={`${matchingTargets.length} matching ${matchingTargets.length === 1 ? "target" : "targets"}`}
          htmlFor="job-target"
          label="Target"
        >
          <Select
            disabled={matchingTargets.length === 0}
            id="job-target"
            onChange={(event) => setTargetId(event.target.value)}
            value={effectiveTarget}
          >
            {matchingTargets.length === 0 ? <option value="">No matching targets</option> : null}
            {matchingTargets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          error={eligibleCompanions.length === 0 ? "No active companion advertises this capability." : undefined}
          hint={`${eligibleCompanions.length} eligible ${eligibleCompanions.length === 1 ? "companion" : "companions"}`}
          htmlFor="job-companion"
          label="Companion"
        >
          <Select
            disabled={eligibleCompanions.length === 0}
            id="job-companion"
            onChange={(event) => setCompanionId(event.target.value)}
            value={effectiveCompanion}
          >
            {eligibleCompanions.length === 0 ? <option value="">No eligible companions</option> : null}
            {eligibleCompanions.map((companion) => (
              <option key={companion.id} value={companion.id}>
                {companion.name}
              </option>
            ))}
          </Select>
        </Field>
        {workflow === "inspect_sqlite_database" ? (
          <Field htmlFor="job-table" hint="Optional. Leave empty to inspect the full schema." label="Table">
            <Input
              id="job-table"
              maxLength={200}
              onChange={(event) => setTable(event.target.value)}
              placeholder="users"
              value={table}
            />
          </Field>
        ) : null}
        {matchingTargets.length === 0 ? (
          <div className="notice notice-warning">
            <div className="notice-body">
              <strong>Target required</strong>
              <span>Add a target whose kind matches this workflow in the Targets tab.</span>
            </div>
          </div>
        ) : null}
        {eligibleCompanions.length === 0 ? (
          <div className="notice notice-warning">
            <div className="notice-body">
              <strong>Companion required</strong>
              <span>
                Pair a companion with this capability from <Link href="/settings">Settings</Link>.
              </span>
            </div>
          </div>
        ) : null}
      </form>
    </Dialog>
  );
}
