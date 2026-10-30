"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconPlus } from "@/components/icons";
import { CopyButton } from "@/components/ui/code-block";
import { Dialog } from "@/components/ui/dialog";
import { Button, ButtonLink, Field, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { apiRequest, ClientApiError } from "@/lib/client-api";
import {
  COMPANION_INSTALL_SCRIPT,
  COMPANION_VERSION,
  companionConnectionState,
  companionInstallCommands,
  detectCompanionPlatform,
  type CompanionPlatform,
} from "@/lib/companion-install";
import type { CompanionRow, TargetRow } from "@/lib/types";
import { WORKFLOWS, formatClientError, targetKindLabel } from "@/lib/ui";

export function AddTargetButton({
  projectId,
  companions = [],
  label = "Select target",
  variant = "secondary",
}: {
  projectId: string;
  companions?: CompanionRow[];
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
      <AddTargetDialog
        companions={companions}
        onClose={() => setOpen(false)}
        open={open}
        projectId={projectId}
      />
    </>
  );
}

function AddTargetDialog({
  open,
  onClose,
  projectId,
  companions,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  companions: CompanionRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState<string>(WORKFLOWS[0].kind);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [origin, setOrigin] = useState("");
  const [platform, setPlatform] = useState<CompanionPlatform>("other");
  const [liveCompanions, setLiveCompanions] = useState<CompanionRow[]>(companions);
  const [newTarget, setNewTarget] = useState<TargetRow | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    setPlatform(detectCompanionPlatform(navigator.userAgent, navigator.platform));
  }, []);

  useEffect(() => {
    if (!open) return;
    setNewTarget(null);
    setError(null);
    setSessionExpired(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let baseline: number | null = null;

    async function checkStatus() {
      try {
        const [targets, companionResult] = await Promise.all([
          apiRequest<{ targets: TargetRow[] }>(`/api/v1/projects/${projectId}/targets`),
          apiRequest<{ companions: CompanionRow[] }>("/api/v1/companions"),
        ]);
        if (cancelled) return;
        setLiveCompanions(companionResult.companions);
        setSessionExpired(false);
        setError(null);

        if (baseline === null) {
          baseline = targets.targets.length;
          return;
        }
        if (targets.targets.length > baseline) {
          baseline = targets.targets.length;
          const newest = targets.targets[0] ?? null;
          setNewTarget(newest);
          toast.push({
            title: "Target selected",
            description: newest
              ? `${newest.label} was registered by your companion.`
              : "Your companion registered a target.",
            tone: "success",
          });
          router.refresh();
        }
      } catch (caught) {
        if (cancelled) return;
        setSessionExpired(caught instanceof ClientApiError && caught.status === 401);
        setError(formatClientError(caught));
      }
    }

    void checkStatus();
    const timer = window.setInterval(() => void checkStatus(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [onClose, open, projectId, router, toast]);

  const connection = companionConnectionState(liveCompanions);
  const commands = companionInstallCommands(origin, COMPANION_VERSION);
  const selectCommand = `amethyst-companion select --project ${projectId} --kind ${kind}`;
  const pairCommand = `amethyst-companion pair --server ${origin || "<your-amethyst-origin>"} --code <code>`;
  const runCommand = "amethyst-companion run";
  const doctorCommand = "amethyst-companion doctor";
  const windowsInstall = platform === "windows";
  const connectionLabel =
    connection === "connected"
      ? "Companion connected"
      : connection === "waiting"
        ? "Waiting for companion"
        : connection === "revoked"
          ? "Previous companion revoked"
          : "Companion not paired";
  const connectionTone =
    connection === "connected"
      ? "status-success"
      : connection === "waiting"
        ? "status-warning"
        : "status-danger";

  return (
    <Dialog
      description="Install the local worker, pair it, then choose a folder on the machine that holds the target. The browser never reads or uploads the path."
      footer={
        <Button onClick={onClose} type="button" variant="secondary">
          Close
        </Button>
      }
      onClose={onClose}
      open={open}
      size="lg"
      title={newTarget ? "Target ready" : "Connect a local companion"}
    >
      <div className="stack">
        {error ? (
          <div className="notice notice-danger" role="alert">
            <div className="notice-body">
              <strong>{sessionExpired ? "Session expired" : "Could not check companion status"}</strong>
              <span>{error}</span>
              {sessionExpired ? (
                <Link href={`/login?next=${encodeURIComponent(`/projects/${projectId}`)}`}>
                  Sign in again
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="notice notice-neutral">
          <div className="notice-body">
            <strong>
              <span className={`status ${connectionTone}`}>
                <span className="status-dot" /> {connectionLabel}
              </span>
            </strong>
            <span>
              {connection === "connected"
                ? "The companion is checking in. Continue with target selection."
                : connection === "waiting"
                  ? "The companion has paired before but is not checking in. Start `amethyst-companion run`."
                  : "Complete steps 1 and 2 on the analysis machine."}
            </span>
          </div>
        </div>

        {newTarget ? (
          <div className="notice notice-success" role="status">
            <div className="notice-body">
              <strong>{newTarget.label} is registered</strong>
              <span>
                The target is ready. Queue an analysis job next; the job reserves credits before the
                companion starts work.
              </span>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <ButtonLink href={`/projects/${projectId}?tab=jobs`} size="sm">
                Continue to jobs
              </ButtonLink>
              <Button
                onClick={() => {
                  setNewTarget(null);
                  router.refresh();
                }}
                size="sm"
                type="button"
                variant="secondary"
              >
                Select another target
              </Button>
            </div>
          </div>
        ) : null}

        <div className="stack-sm">
          <span className="label">1. Install or upgrade the companion</span>
          {origin && commands.downloadCommand ? (
            <>
              <div className="command-line">{commands.downloadCommand}</div>
              <div className="command-line">{commands.installCommand}</div>
              <div className="row" style={{ gap: 8, marginTop: 6 }}>
                <CopyButton
                  value={`${commands.downloadCommand}\n${commands.installCommand}`}
                  label="Copy install"
                />
                <a href={commands.installScriptUrl} rel="noreferrer" target="_blank">
                  View installer
                </a>
              </div>
            </>
          ) : (
            <p className="muted small">Loading the download URL…</p>
          )}
          <p className="muted small">
            Run these commands from any directory on the machine that holds the target. This installs
            companion v{COMPANION_VERSION} under <code>~/.local/share/amethyst-companion</code> and a
            launcher under <code>~/.local/bin</code>. No Amethyst source checkout is needed.{" "}
            {windowsInstall
              ? "The installer is POSIX shell; on Windows, run it inside WSL. Native selection there requires --path."
              : platform === "linux"
                ? "Ubuntu users should also install zenity for the native folder picker."
                : null}
          </p>
          <p className="muted small">
            Installer file: <code>{COMPANION_INSTALL_SCRIPT}</code>. Run{" "}
            <code>amethyst-companion doctor</code> after upgrading if a command is not found.
          </p>
        </div>

        <div className="stack-sm">
          <span className="label">2. Pair this browser account</span>
          <p className="muted small">
            <Link href="/settings#companions">Open companion settings</Link> and choose{" "}
            <strong>Pair companion</strong> to create a one-time code. Then run:
          </p>
          <div className="command-line">{pairCommand}</div>
          <div className="row" style={{ marginTop: 6 }}>
            <CopyButton value={pairCommand} label="Copy pair command" />
          </div>
        </div>

        <div className="stack-sm">
          <span className="label">3. Select a target on that machine</span>
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
          <div className="command-line">{selectCommand}</div>
          <div className="row" style={{ marginTop: 6 }}>
            <CopyButton value={selectCommand} label="Copy select command" />
          </div>
          <p className="muted small">
            The command opens the native picker on the companion machine, validates the path,
            records explicit local approval, and registers the target. If no picker is available,
            append <code>--path /absolute/path</code>.
          </p>
        </div>

        <div className="stack-sm">
          <span className="label">4. Keep the worker running</span>
          <div className="command-line">{runCommand}</div>
          <div className="row" style={{ marginTop: 6 }}>
            <CopyButton value={`${selectCommand}\n${runCommand}`} label="Copy select + run" />
            <CopyButton value={doctorCommand} label="Copy doctor" />
          </div>
          <p className="muted small">
            The companion claims queued jobs and reports progress here. This dialog detects the new
            target automatically; you can close it after registration and queue a job from the Jobs
            tab.
          </p>
        </div>
      </div>
    </Dialog>
  );
}
