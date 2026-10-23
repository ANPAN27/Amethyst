"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconPlus } from "@/components/icons";
import { CopyButton } from "@/components/ui/code-block";
import { Dialog } from "@/components/ui/dialog";
import { Button, Field, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/client-api";
import type { TargetRow } from "@/lib/types";
import { WORKFLOWS, formatClientError, targetKindLabel } from "@/lib/ui";

export function AddTargetButton({
  projectId,
  label = "Select target",
  variant = "secondary",
}: {
  projectId: string;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" variant={variant}>
        <IconPlus size={13} />
        {label}
      </Button>
      <AddTargetDialog onClose={() => setOpen(false)} open={open} projectId={projectId} />
    </>
  );
}

function AddTargetDialog({
  open,
  onClose,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState<string>(WORKFLOWS[0].kind);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let baseline: number | null = null;

    async function checkTargets() {
      try {
        const result = await apiRequest<{ targets: TargetRow[] }>(
          `/api/v1/projects/${projectId}/targets`,
        );
        if (cancelled) return;
        if (baseline === null) {
          baseline = result.targets.length;
          return;
        }
        if (result.targets.length > baseline) {
          const newest = result.targets[0];
          toast.push({
            title: "Target selected",
            description: newest
              ? `${newest.label} was registered by your companion.`
              : "Your companion registered a target.",
            tone: "success",
          });
          router.refresh();
          onClose();
        }
      } catch (caught) {
        if (!cancelled) setError(formatClientError(caught));
      }
    }

    void checkTargets();
    const timer = window.setInterval(() => void checkTargets(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [onClose, open, projectId, router, toast]);

  const setupCommand = "cd /path/to/amethyst && npm run companion:setup";
  const selectCommand = `amethyst-companion select --project ${projectId} --kind ${kind}`;

  return (
    <Dialog
      description="Choose the folder on the machine that runs the companion. The browser never reads or uploads the path."
      footer={
        <Button onClick={onClose} type="button" variant="secondary">
          Close
        </Button>
      }
      onClose={onClose}
      open={open}
      title="Select a local target"
    >
      <div className="stack">
        {error ? (
          <div className="notice notice-danger" role="alert">
            <div className="notice-body">{error}</div>
          </div>
        ) : null}
        <Field htmlFor="target-kind" label="Target kind">
          <Select
            id="target-kind"
            onChange={(event) => setKind(event.target.value)}
            value={kind}
          >
            {WORKFLOWS.map((workflow) => (
              <option key={workflow.kind} value={workflow.kind}>
                {workflow.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="notice notice-neutral">
          <div className="notice-body">
            <strong>{targetKindLabel(kind)}</strong>
            <span>{WORKFLOWS.find((workflow) => workflow.kind === kind)?.description}</span>
          </div>
        </div>
        <div className="stack-sm">
          <span className="label">1. Prepare the companion (first time only)</span>
          <div className="command-line">{setupCommand}</div>
          <div className="row" style={{ marginTop: 6 }}>
            <CopyButton value={setupCommand} label="Copy setup" />
          </div>
        </div>
        <div className="stack-sm">
          <span className="label">2. Select the target on that machine</span>
          <div className="command-line">{selectCommand}</div>
          <div className="row" style={{ marginTop: 6 }}>
            <CopyButton value={selectCommand} label="Copy command" />
          </div>
          <p className="muted small">
            Run this from any directory after setup. It opens a native file chooser, validates the
            path locally, records explicit approval, and registers the target. On Ubuntu install{" "}
            <code>zenity</code> if no picker is available; non-interactive runs can pass{" "}
            <code>--path</code>.
          </p>
        </div>
        <div className="notice notice-neutral">
          <div className="notice-body">
            <strong>
              <span className="status status-live">
                <span className="status-dot" /> Waiting for the companion
              </span>
            </strong>
            <span>
              This dialog detects the new target automatically. Start{" "}
              <code>amethyst-companion run</code> to process analysis jobs.
            </span>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
