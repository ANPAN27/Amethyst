"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CopyButton } from "@/components/ui/code-block";
import { ConfirmDialog } from "@/components/ui/dialog";
import {
  Badge,
  Button,
  EmptyState,
  StatusBadge,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/client-api";
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

  const setupCommand = "cd /path/to/amethyst && npm run companion:setup";
  const pairCommand = `amethyst-companion pair --server ${origin || "<your-amethyst-origin>"} --code ${pairing?.code ?? "<code>"}`;
  const selectCommand = "amethyst-companion select --project <project-id> --kind javascript_application";
  const runCommand = "amethyst-companion run";
  const bashPathCommand = `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc`;
  const bashReloadCommand = "source ~/.bashrc";

  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Local companions</h2>
            <p>Authorized workers that perform inspection on your machine.</p>
          </div>
          <Button disabled={busy} onClick={pair} size="sm">
            {busy ? "Generating…" : "Pair companion"}
          </Button>
        </div>

        {pairing ? (
          <div className="panel-body">
            <div className="pairing-box">
              <div className="row spread">
                <span className="label">One-time pairing code</span>
                <Badge tone="warning" mono>Expires {formatDateTime(pairing.expires_at)}</Badge>
              </div>
              <div className="pairing-code" style={{ marginTop: 10 }}>{pairing.code}</div>
              <p className="muted small" style={{ marginTop: 8 }}>
                Run the one-time setup on the authorized analysis machine from a clone of the
                Amethyst repository. <code>companion:setup</code> is an Amethyst package script; it
                does not exist inside the project you want to analyze. The setup builds the CLI and
                installs a stable launcher under <code>~/.local/bin</code>, so the remaining
                commands work from any directory. The pairing code is single-use and short-lived.
              </p>
              <span className="label" style={{ display: "block", marginTop: 10 }}>
                1. One-time setup / Amethyst repository only
              </span>
              <div className="command-line">{setupCommand}</div>
              <span className="label" style={{ display: "block", marginTop: 10 }}>
                2. Pair / any directory, after setup
              </span>
              <div className="command-line">{pairCommand}</div>
              <div className="row" style={{ marginTop: 9 }}>
                <CopyButton value={pairing.code} label="Copy code" />
                <CopyButton value={`${setupCommand}\n${pairCommand}`} label="Copy setup + pair" />
              </div>
              <span className="label" style={{ display: "block", marginTop: 10 }}>
                3. Select a target / any directory, after pairing
              </span>
              <div className="command-line">{selectCommand}</div>
              <p className="muted small" style={{ marginTop: 8 }}>
                Replace <code>&lt;project-id&gt;</code> with the project that should own the target.
                The picker opens on the companion machine. For a known absolute path, append{" "}
                <code>--path /absolute/path</code>. Install <code>zenity</code> on Ubuntu if no
                native picker is available.
              </p>
              <span className="label" style={{ display: "block", marginTop: 10 }}>
                4. Start the worker / any directory, after selecting
              </span>
              <div className="command-line">{runCommand}</div>
              <div className="row" style={{ marginTop: 9 }}>
                <CopyButton
                  value={`${selectCommand}\n${runCommand}`}
                  label="Copy select + run"
                />
              </div>
              <p className="muted small" style={{ marginTop: 8 }}>
                Keep <code>{runCommand}</code> running to claim analysis jobs. If{" "}
                <code>amethyst-companion</code> is not found, <code>~/.local/bin</code> is missing
                from PATH. Add it for bash:
              </p>
              <div className="command-line">{bashPathCommand}</div>
              <div className="command-line">{bashReloadCommand}</div>
              <p className="muted small" style={{ marginTop: 8 }}>
                For zsh, use <code>~/.zshrc</code> instead. The launcher also works directly as{" "}
                <code>~/.local/bin/amethyst-companion --help</code> without changing PATH.
              </p>
            </div>
          </div>
        ) : null}

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
                      <StatusBadge status={companion.status} />
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
            its credential immediately.
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
