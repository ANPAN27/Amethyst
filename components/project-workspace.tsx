"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { apiRequest, ClientApiError } from "@/lib/client-api";

export type ProjectDetail = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

export type TargetRow = {
  id: string;
  kind: string;
  label: string;
  target_path?: string;
  created_at: string;
};

export type JobRow = {
  id: string;
  workflow: string;
  status: string;
  progress: number;
  error_code: string | null;
  error_message: string | null;
  result_summary: Record<string, unknown> | null;
  created_at: string;
  finished_at: string | null;
};

export type CompanionRow = {
  id: string;
  name: string;
  platform: string | null;
  version: string | null;
  capabilities: string[];
  status: string;
  paired_at: string;
  last_seen_at: string | null;
};

export type FindingRow = {
  id: string;
  job_id: string;
  class: string;
  category: string | null;
  title: string;
  detail: string | null;
  confidence: number | null;
  created_at: string;
};

export type CreditBalance = {
  available: number;
  reserved: number;
  total: number;
};

type PairingCode = {
  code: string;
  expires_at: string;
};

type AiResult =
  | {
      kind: "chat";
      answer: string;
      grounding: string;
      citedEvidenceIds: string[];
      assumptions: string[];
      creditsCharged: number;
    }
  | {
      kind: "codegen";
      answer: string;
      code: string;
      language: string;
      grounding: string;
      citedEvidenceIds: string[];
      assumptions: string[];
      limitations: string[];
      creditsCharged: number;
    };

const WORKFLOWS = [
  { value: "analyze_javascript_application", label: "JavaScript application", kind: "javascript_application" },
  { value: "inspect_managed_artifact", label: "Managed artifact", kind: "managed_artifact" },
  { value: "inspect_sqlite_database", label: "SQLite database", kind: "sqlite_database" },
  { value: "inspect_go_binary", label: "Go binary", kind: "go_binary" },
  { value: "inspect_rust_binary", label: "Rust binary", kind: "rust_binary" },
] as const;

const TARGET_KINDS = WORKFLOWS.map((workflow) => workflow.kind);

function errorMessage(error: unknown): string {
  if (error instanceof ClientApiError) return `${error.message} (${error.code})`;
  return error instanceof Error ? error.message : "Unexpected error";
}

function workflowLabel(workflow: string): string {
  return WORKFLOWS.find((item) => item.value === workflow)?.label ?? workflow;
}

function statusBadge(status: string): string {
  if (["succeeded", "active", "observed"].includes(status)) return "badge succeeded";
  if (["failed", "revoked"].includes(status)) return "badge failed";
  return `badge ${status}`;
}

export function ProjectWorkspace({
  project,
  targets,
  jobs,
  companions,
  findings,
  credits,
}: {
  project: ProjectDetail;
  targets: TargetRow[];
  jobs: JobRow[];
  companions: CompanionRow[];
  findings: FindingRow[];
  credits: CreditBalance;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [targetKind, setTargetKind] = useState<string>(
    TARGET_KINDS[0] ?? "javascript_application",
  );
  const [targetLabel, setTargetLabel] = useState("");
  const [targetPath, setTargetPath] = useState("");
  const [targetBusy, setTargetBusy] = useState(false);

  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const activeCompanions = companions.filter((companion) => companion.status === "active");
  const [workflow, setWorkflow] = useState<string>(WORKFLOWS[0]?.value ?? "analyze_javascript_application");
  const [targetId, setTargetId] = useState("");
  const [companionId, setCompanionId] = useState("");
  const [table, setTable] = useState("");
  const [jobBusy, setJobBusy] = useState(false);

  const [selectedFindings, setSelectedFindings] = useState<string[]>([]);
  const [aiMode, setAiMode] = useState<"chat" | "codegen">("chat");
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState("typescript");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);

  const selectedWorkflow = WORKFLOWS.find((item) => item.value === workflow);
  const matchingTargets = targets.filter((target) => target.kind === selectedWorkflow?.kind);

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function createTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTargetBusy(true);
    setError(null);
    setNotice(null);

    try {
      await apiRequest(`/api/v1/projects/${project.id}/targets`, {
        method: "POST",
        body: JSON.stringify({
          kind: targetKind,
          label: targetLabel,
          target_path: targetPath,
        }),
      });
      setTargetLabel("");
      setTargetPath("");
      setNotice("Target added. The companion will ask for local approval on first use.");
      refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setTargetBusy(false);
    }
  }

  async function generatePairingCode() {
    setPairingBusy(true);
    setError(null);
    setNotice(null);

    try {
      const result = await apiRequest<{ pairing: { code: string; expires_at: string } }>(
        "/api/v1/companions/pairing",
        { method: "POST", body: "{}" },
      );
      setPairing(result.pairing);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPairingBusy(false);
    }
  }

  async function revokeCompanion(id: string) {
    if (!window.confirm("Revoke this companion? Its local token will stop working immediately.")) {
      return;
    }
    setError(null);
    try {
      await apiRequest(`/api/v1/companions/${id}`, { method: "DELETE" });
      setNotice("Companion revoked.");
      refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function createJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJobBusy(true);
    setError(null);
    setNotice(null);

    if (!targetId || !companionId) {
      setError("Select an analysis target and an active companion.");
      setJobBusy(false);
      return;
    }

    try {
      await apiRequest(`/api/v1/projects/${project.id}/jobs`, {
        method: "POST",
        body: JSON.stringify({
          workflow,
          target_id: targetId,
          companion_id: companionId,
          ...(workflow === "inspect_sqlite_database" && table.trim()
            ? { params: { table: table.trim() } }
            : {}),
        }),
      });
      setNotice("Job queued. Start the companion with `run` to claim it.");
      refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setJobBusy(false);
    }
  }

  async function downloadArtifact(jobId: string) {
    setError(null);
    try {
      const result = await apiRequest<{ url: string }>(`/api/v1/jobs/${jobId}/artifact`);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function askAi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAiBusy(true);
    setError(null);
    setNotice(null);
    setAiResult(null);

    const findingIds = selectedFindings.length > 0 ? selectedFindings : undefined;

    try {
      if (aiMode === "chat") {
        const result = await apiRequest<{
          answer: string;
          grounding: string;
          cited_evidence_ids: string[];
          assumptions: string[];
          credits_charged: number;
        }>(`/api/v1/projects/${project.id}/ai/chat`, {
          method: "POST",
          body: JSON.stringify({ question: prompt, ...(findingIds ? { finding_ids: findingIds } : {}) }),
        });
        setAiResult({
          kind: "chat",
          answer: result.answer,
          grounding: result.grounding,
          citedEvidenceIds: result.cited_evidence_ids,
          assumptions: result.assumptions,
          creditsCharged: result.credits_charged,
        });
      } else {
        const result = await apiRequest<{
          answer: string;
          code: string;
          language: string;
          grounding: string;
          cited_evidence_ids: string[];
          assumptions: string[];
          limitations: string[];
          credits_charged: number;
        }>(`/api/v1/projects/${project.id}/ai/codegen`, {
          method: "POST",
          body: JSON.stringify({
            instructions: prompt,
            language,
            ...(findingIds ? { finding_ids: findingIds } : {}),
          }),
        });
        setAiResult({
          kind: "codegen",
          answer: result.answer,
          code: result.code,
          language: result.language,
          grounding: result.grounding,
          citedEvidenceIds: result.cited_evidence_ids,
          assumptions: result.assumptions,
          limitations: result.limitations,
          creditsCharged: result.credits_charged,
        });
      }
      refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setAiBusy(false);
    }
  }

  function toggleFinding(id: string) {
    setSelectedFindings((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  return (
    <>
      <div className="card-header">
        <div>
          <h1>{project.name}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {project.description || "No description"}
          </p>
        </div>
        <div className="row">
          <span className="badge">{credits.available} credits</span>
          <button className="secondary" disabled={pending} type="button" onClick={refresh}>
            {pending ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error ? <div className="alert error">{error}</div> : null}
      {notice ? <div className="alert success">{notice}</div> : null}
      {credits.reserved > 0 ? (
        <div className="alert notice">{credits.reserved} credits are currently reserved by AI runs.</div>
      ) : null}

      <div className="grid">
        <section className="card">
          <div className="card-header">
            <h2>Analysis targets</h2>
            <span className="badge">{targets.length}</span>
          </div>
          {targets.length === 0 ? (
            <p className="empty">No targets yet.</p>
          ) : (
            <ul className="list">
              {targets.map((target) => (
                <li className="list-item" key={target.id}>
                  <div className="row spread">
                    <strong>{target.label}</strong>
                    <span className="badge">{target.kind}</span>
                  </div>
                  {target.target_path ? (
                    <p className="small muted" style={{ margin: "6px 0 0", wordBreak: "break-all" }}>
                      {target.target_path}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <hr className="divider" />
          <h3>Add target</h3>
          <form className="stack" onSubmit={createTarget}>
            <label className="field">
              <span>Kind</span>
              <select value={targetKind} onChange={(event) => setTargetKind(event.target.value)}>
                {TARGET_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Label</span>
              <input
                maxLength={200}
                onChange={(event) => setTargetLabel(event.target.value)}
                placeholder="web client"
                required
                value={targetLabel}
              />
            </label>
            <label className="field">
              <span>Absolute local path</span>
              <input
                maxLength={4096}
                onChange={(event) => setTargetPath(event.target.value)}
                placeholder="/home/me/src/client"
                required
                value={targetPath}
              />
            </label>
            <button disabled={targetBusy} type="submit">
              {targetBusy ? "Adding..." : "Add target"}
            </button>
            <p className="small muted" style={{ margin: 0 }}>
              Paths are stored for your paired companion and are never sent to the AI provider.
            </p>
          </form>
        </section>

        <section className="card">
          <div className="card-header">
            <h2>Companions</h2>
            <button className="secondary" disabled={pairingBusy} type="button" onClick={generatePairingCode}>
              {pairingBusy ? "Generating..." : "Pair a companion"}
            </button>
          </div>

          {pairing ? (
            <div className="alert notice">
              <p style={{ marginBottom: 6 }}>
                One-time code: <strong>{pairing.code}</strong>
              </p>
              <p className="small" style={{ marginBottom: 6 }}>
                Expires {new Date(pairing.expires_at).toLocaleString()}. Run on the analysis machine:
              </p>
              <pre>{`node companion/dist/cli.js pair --server ${origin || "<your-amethyst-origin>"} --code ${pairing.code}`}</pre>
            </div>
          ) : null}

          {companions.length === 0 ? (
            <p className="empty">No paired companions.</p>
          ) : (
            <ul className="list">
              {companions.map((companion) => (
                <li className="list-item" key={companion.id}>
                  <div className="row spread">
                    <strong>{companion.name}</strong>
                    <span className={statusBadge(companion.status)}>{companion.status}</span>
                  </div>
                  <p className="small muted" style={{ margin: "6px 0 0" }}>
                    {companion.platform ?? "unknown platform"} · {companion.capabilities.length}{" "}
                    workflows
                  </p>
                  {companion.status === "active" ? (
                    <button
                      className="danger"
                      style={{ marginTop: 8 }}
                      type="button"
                      onClick={() => revokeCompanion(companion.id)}
                    >
                      Revoke
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid">
        <section className="card">
          <div className="card-header">
            <h2>New analysis job</h2>
          </div>
          <form className="stack" onSubmit={createJob}>
            <label className="field">
              <span>Workflow</span>
              <select
                value={workflow}
                onChange={(event) => {
                  setWorkflow(event.target.value);
                  setTargetId("");
                }}
              >
                {WORKFLOWS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Target</span>
              <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                <option value="">Select a matching target</option>
                {matchingTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Companion</span>
              <select value={companionId} onChange={(event) => setCompanionId(event.target.value)}>
                <option value="">Select an active companion</option>
                {activeCompanions.map((companion) => (
                  <option key={companion.id} value={companion.id}>
                    {companion.name}
                  </option>
                ))}
              </select>
            </label>
            {workflow === "inspect_sqlite_database" ? (
              <label className="field">
                <span>Table (optional)</span>
                <input
                  maxLength={200}
                  onChange={(event) => setTable(event.target.value)}
                  placeholder="users"
                  value={table}
                />
              </label>
            ) : null}
            <button disabled={jobBusy || matchingTargets.length === 0 || activeCompanions.length === 0} type="submit">
              {jobBusy ? "Queueing..." : "Queue job"}
            </button>
            {matchingTargets.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>
                Add a {selectedWorkflow?.kind} target before queueing this workflow.
              </p>
            ) : null}
            {activeCompanions.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>
                Pair a companion before queueing a job.
              </p>
            ) : null}
          </form>
        </section>

        <section className="card">
          <div className="card-header">
            <h2>Jobs</h2>
            <span className="badge">{jobs.length}</span>
          </div>
          {jobs.length === 0 ? (
            <p className="empty">No jobs yet.</p>
          ) : (
            <ul className="list">
              {jobs.map((job) => (
                <li className="list-item" key={job.id}>
                  <div className="row spread">
                    <strong>{workflowLabel(job.workflow)}</strong>
                    <span className={statusBadge(job.status)}>{job.status}</span>
                  </div>
                  <div className="progress" style={{ marginTop: 8 }}>
                    <span style={{ width: `${job.progress}%` }} />
                  </div>
                  <p className="small muted" style={{ margin: "6px 0 0" }}>
                    {job.progress}% · {new Date(job.created_at).toLocaleString()}
                  </p>
                  {job.error_message ? (
                    <p className="small" style={{ color: "var(--danger)", margin: "6px 0 0" }}>
                      {job.error_code ? `${job.error_code}: ` : ""}
                      {job.error_message}
                    </p>
                  ) : null}
                  {job.status === "succeeded" ? (
                    <button
                      className="secondary"
                      style={{ marginTop: 8 }}
                      type="button"
                      onClick={() => downloadArtifact(job.id)}
                    >
                      Download evidence
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-header">
          <h2>Findings</h2>
          <span className="badge">{findings.length}</span>
        </div>
        <p className="small muted">
          Select findings to include as AI evidence. If none are selected, the 30 most recent are
          used.
        </p>
        {findings.length === 0 ? (
          <p className="empty">No findings yet. Queue a job and run the companion.</p>
        ) : (
          <ul className="list">
            {findings.map((finding) => (
              <li
                className={`list-item ${selectedFindings.includes(finding.id) ? "selected" : ""}`}
                key={finding.id}
              >
                <label className="checkbox">
                  <input
                    checked={selectedFindings.includes(finding.id)}
                    onChange={() => toggleFinding(finding.id)}
                    type="checkbox"
                  />
                  <span>
                    <span className={statusBadge(finding.class)}>{finding.class}</span>{" "}
                    {finding.category ? (
                      <span className="badge">{finding.category}</span>
                    ) : null}
                    <strong style={{ display: "block", marginTop: 4 }}>{finding.title}</strong>
                    {finding.detail ? (
                      <span className="small muted" style={{ display: "block", marginTop: 4 }}>
                        {finding.detail}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Ask about this project</h2>
          <span className="badge">{selectedFindings.length} selected</span>
        </div>
        <div className="tabs">
          <button
            className={aiMode === "chat" ? "active" : ""}
            type="button"
            onClick={() => setAiMode("chat")}
          >
            Explain
          </button>
          <button
            className={aiMode === "codegen" ? "active" : ""}
            type="button"
            onClick={() => setAiMode("codegen")}
          >
            Generate code
          </button>
        </div>

        <form className="stack" onSubmit={askAi}>
          <label className="field">
            <span>{aiMode === "chat" ? "Question" : "Instructions"}</span>
            <textarea
              maxLength={8000}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={
                aiMode === "chat"
                  ? "What does the observed module structure suggest about entry points?"
                  : "Write a reviewable TypeScript helper based only on these findings."
              }
              required
              value={prompt}
            />
          </label>
          {aiMode === "codegen" ? (
            <label className="field">
              <span>Language</span>
              <input
                maxLength={60}
                onChange={(event) => setLanguage(event.target.value)}
                value={language}
              />
            </label>
          ) : null}
          <button disabled={aiBusy} type="submit">
            {aiBusy ? "Working..." : aiMode === "chat" ? "Ask" : "Generate"}
          </button>
          <p className="small muted" style={{ margin: 0 }}>
            Answers cite stored findings only. Generated code is returned for review and is never
            applied or executed.
          </p>
        </form>

        {aiResult ? (
          <div className="alert notice" style={{ marginTop: 16 }}>
            <div className="row spread">
              <strong>AI response</strong>
              <span className="badge">{aiResult.grounding}</span>
            </div>
            <p style={{ whiteSpace: "pre-wrap" }}>{aiResult.answer}</p>
            {aiResult.kind === "codegen" ? (
              <pre>
                <code>{aiResult.code}</code>
              </pre>
            ) : null}
            {aiResult.citedEvidenceIds.length > 0 ? (
              <p className="small muted">Cited findings: {aiResult.citedEvidenceIds.join(", ")}</p>
            ) : null}
            {aiResult.assumptions.length > 0 ? (
              <p className="small muted">Assumptions: {aiResult.assumptions.join("; ")}</p>
            ) : null}
            <p className="small muted" style={{ marginBottom: 0 }}>
              {aiResult.creditsCharged} credits charged.
            </p>
          </div>
        ) : null}
      </section>
    </>
  );
}
