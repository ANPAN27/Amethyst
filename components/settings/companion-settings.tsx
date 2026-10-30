"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CopyButton } from "@/components/ui/code-block";
import { ConfirmDialog } from "@/components/ui/dialog";
import {
  Badge,
  Button,
  EmptyState,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/client-api";
import {
  COMPANION_INSTALL_SCRIPT,
  COMPANION_VERSION,
  companionInstallCommands,
  isCompanionConnected,
} from "@/lib/companion-install";
import type { CompanionRow } from "@/lib/types";
import { formatDateTime, formatClientError, workflowLabel } from "@/lib/ui";

type Pairing = {
  code: string;
  expires_at: string;
  expires_in_seconds: number;
};

export function CompanionSettings({ companions }: { companions: CompanionRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<CompanionRow | null>(null);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  async function pair() {
    setBusy(true);
    try {
      const result = await apiRequest<{ pairing: Pairing }>("/api/v1/companions/pairing", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setPairing(result.pairing);
      toast.push({
        title: "Pairing code generated",
        description: "The code expires in 10 minutes and can be used once.",
        tone: "success",
      });
      router.refresh();
    } catch (caught) {
      toast.push({ title: "Could not create pairing code", description: formatClientError(caught), tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await apiRequest(`/api/v1/companions/${revokeTarget.id}`, { method: "DELETE" });
      toast.push({ title: "Companion revoked", description: "Its token can no longer authenticate.", tone: "success" });
      setRevokeTarget(null);
      router.refresh();
    } catch (caught) {
      toast.push({ title: "Could not revoke companion", description: formatClientError(caught), tone: "danger" });
    } finally {
      setRevoking(false);
    }
  }

  const commands = companionInstallCommands(origin, COMPANION_VERSION);
  const pairCommand = `amethyst-companion pair --server ${origin || "<your-amethyst-origin>"} --code ${pairing?.code ?? "<code>"}`;
  const selectCommand = "amethyst-companion select --project <project-id> --kind javascript_application";
  const runCommand = "amethyst-companion run";
  const doctorCommand = "amethyst-companion doctor";
  const bashPathCommand = `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc`;
  const bashReloadCommand = "source ~/.bashrc";

  return (
    <>
      <section className="panel" id="companions">
        <div className="panel-header">
          <div>
            <h2>Local companions</h2>
            <p>Install a standalone worker, authorize it, and keep it running.</p>
          </div>
          <Button disabled={busy} onClick={pair} size="sm">
            {busy ? "Generating…" : "Pair companion"}
          </Button>
        </div>

        <div className="panel-body">
          <div className="pairing-box">
            <div className="row spread">
              <span className="label">
                {pairing ? "One-time pairing code" : "Standalone companion"}
              </span>
              {pairing ? (
                <Badge tone="warning" mono>Expires {formatDateTime(pairing.expires_at)}</Badge>
              ) : (
                <Badge mono>v{COMPANION_VERSION}</Badge>
              )}
            </div>
            {pairing ? (
              <>
                <div className="pairing-code" style={{ marginTop: 10 }}>{pairing.code}</div>
                <p className="muted small" style={{ marginTop: 8 }}>
                  This code is single-use and expires after 10 minutes. Complete the pairing command
                  on the analysis machine before it expires.
                </p>
              </>
            ) : (
              <p className="muted small" style={{ marginTop: 8 }}>
                Install the companion on the machine that holds the target, then generate a one-time
                code with <strong>Pair companion</strong>. No Amethyst source checkout is required.
              </p>
            )}

            <span className="label" style={{ display: "block", marginTop: 12 }}>
              1. Install or upgrade / any directory
            </span>
            {commands.downloadCommand ? (
              <>
                <div className="command-line">{commands.downloadCommand}</div>
                <div className="command-line">{commands.installCommand}</div>
                <p className="muted small" style={{ marginTop: 8 }}>
                  Installs companion v{COMPANION_VERSION} under{" "}
                  <code>~/.local/share/amethyst-companion</code> with a launcher in{" "}
                  <code>~/.local/bin</code>. Ubuntu users need <code>zenity</code> for the native
                  picker. Installer: <a href={commands.installScriptUrl}>{COMPANION_INSTALL_SCRIPT}</a>.
                  On Windows, run the POSIX installer inside WSL and use <code>--path</code>.
                </p>
              </>
            ) : (
              <p className="muted small">Loading the installer URL…</p>
            )}

            <span className="label" style={{ display: "block", marginTop: 12 }}>
              2. Pair / after installing
            </span>
            <div className="command-line">{pairCommand}</div>
            <div className="row" style={{ marginTop: 9 }}>
              {pairing ? <CopyButton value={pairing.code} label="Copy code" /> : null}
              <CopyButton value={pairCommand} label="Copy pair command" />
            </div>

            <span className="label" style={{ display: "block", marginTop: 12 }}>
              3. Select a target / after pairing
            </span>
            <div className="command-line">{selectCommand}</div>
            <p className="muted small" style={{ marginTop: 8 }}>
              Replace <code>&lt;project-id&gt;</code> with the project that should own the target.
              The picker opens on the companion machine. For a known absolute path, append{" "}
              <code>--path /absolute/path</code>.
            </p>

            <span className="label" style={{ display: "block", marginTop: 12 }}>
              4. Start the worker / after selecting
            </span>
            <div className="command-line">{runCommand}</div>
            <div className="row" style={{ marginTop: 9 }}>
              <CopyButton value={`${selectCommand}\n${runCommand}`} label="Copy select + run" />
              <CopyButton value={doctorCommand} label="Copy doctor" />
            </div>
            <p className="muted small" style={{ marginTop: 8 }}>
              Keep <code>{runCommand}</code> running to claim analysis jobs. Run{" "}
              <code>{doctorCommand}</code> to check Node.js, configuration, server connectivity, and
              approved paths. If <code>amethyst-companion</code> is not found, add{" "}
              <code>~/.local/bin</code> to PATH:
            </p>
            <div className="command-line">{bashPathCommand}</div>
            <div className="command-line">{bashReloadCommand}</div>
            <p className="muted small" style={{ marginTop: 8 }}>
              For zsh, use <code>~/.zshrc</code> instead. The launcher also works directly as{" "}
              <code>~/.local/bin/amethyst-companion --help</code> without changing PATH.
            </p>
          </div>
        </div>

        {companions.length === 0 ? (
          <EmptyState
            compact
            description="Generate a one-time code and run the companion CLI on the machine that holds the target."
            title="No companions paired"
          />
        ) : (
          <div className="panel-body">
            <div className="stack-sm">
              {companions.map((companion) => (
                <div className="companion-row" key={companion.id}>
                  <div className="companion-row-copy">
                    <div className="row" style={{ gap: 8 }}>
                      <strong>{companion.name}</strong>
                      <span
                        className={`status ${
                          companion.status !== "active"
                            ? "status-danger"
                            : isCompanionConnected(companion)
                              ? "status-success"
                              : "status-warning"
                        }`}
                      >
                        <span className="status-dot" />
                        {companion.status !== "active"
                          ? "Revoked"
                          : isCompanionConnected(companion)
                            ? "Connected"
                            : "Waiting for heartbeat"}
                      </span>
                    </div>
                    <span>
                      {companion.platform || "unknown platform"}
                      {companion.version ? ` / v${companion.version}` : ""}
                    </span>
                    <div className="row" style={{ gap: 4, marginTop: 5 }}>
                      {companion.capabilities.length > 0 ? (
                        companion.capabilities.map((capability) => (
                          <Badge key={capability} mono>{workflowLabel(capability)}</Badge>
                        ))
                      ) : (
                        <span className="muted small">No advertised capabilities</span>
                      )}
                    </div>
                    <span style={{ marginTop: 5 }}>
                      Paired {formatDateTime(companion.paired_at)} / last seen{" "}
                      {formatDateTime(companion.last_seen_at)}
                    </span>
                  </div>
                  {companion.status === "active" ? (
                    <Button
                      onClick={() => setRevokeTarget(companion)}
                      size="sm"
                      variant="danger"
                      type="button"
                    >
                      Revoke
                    </Button>
                  ) : (
                    <Badge tone="danger">Revoked {companion.revoked_at ? formatDateTime(companion.revoked_at) : ""}</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="panel-footer" style={{ justifyContent: "flex-start" }}>
          <span className="muted small">
            Pairing codes and bearer tokens are stored as HMAC digests. Revoking a companion deletes
            its credential immediately. Connection status is based on a recent companion heartbeat.
          </span>
        </div>
      </section>

      <ConfirmDialog
        busy={revoking}
        confirmLabel="Revoke companion"
        danger
        description={
          revokeTarget
            ? `Revoke ${revokeTarget.name}? Its local token will stop authenticating and it can no longer claim or update jobs.`
            : ""
        }
        onClose={() => setRevokeTarget(null)}
        onConfirm={revoke}
        open={Boolean(revokeTarget)}
        title="Revoke companion?"
      />
    </>
  );
}
