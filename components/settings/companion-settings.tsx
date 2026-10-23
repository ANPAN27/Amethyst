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
  const command = `amethyst-companion pair --server ${origin || "<your-amethyst-origin>"} --code ${pairing?.code ?? "<code>"}`;
  const runCommand = "amethyst-companion run";

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
                On the authorized analysis machine, run the setup from the Amethyst repository
                root. It builds the CLI and links <code>amethyst-companion</code> into{" "}
                <code>~/.local/bin</code>, so the remaining commands work from any directory. The
                code is single-use and short-lived.
              </p>
              <span className="label" style={{ display: "block", marginTop: 10 }}>
                1. Prepare (first time only)
              </span>
              <div className="command-line">{setupCommand}</div>
              <span className="label" style={{ display: "block", marginTop: 10 }}>
                2. Pair with this code
              </span>
              <div className="command-line">{command}</div>
              <div className="row" style={{ marginTop: 9 }}>
                <CopyButton value={pairing.code} label="Copy code" />
                <CopyButton value={`${setupCommand}\n${command}`} label="Copy commands" />
              </div>
              <p className="muted small" style={{ marginTop: 8 }}>
                Keep <code>{runCommand}</code> running to claim analysis jobs. Select local targets
                from a project&apos;s Targets tab; the companion opens a native picker on that
                machine. If the command is not found, add <code>~/.local/bin</code> to your PATH.
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
