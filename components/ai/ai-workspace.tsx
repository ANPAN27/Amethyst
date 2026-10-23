"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  IconAi,
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconRefresh,
} from "@/components/icons";
import { CodeBlock } from "@/components/ui/code-block";
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  Notice,
  Select,
  StatusBadge,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/client-api";
import type { AiProjectOption, FindingRow } from "@/lib/types";
import { classTone, formatClientError, shortId } from "@/lib/ui";

type Mode = "chat" | "codegen";

type ChatResponse = {
  id: string;
  answer: string;
  grounding: string;
  cited_evidence_ids: string[];
  assumptions: string[];
  evidence: { id: string; title: string; class: string }[];
  credits_charged: number;
};

type CodegenResponse = ChatResponse & {
  code: string;
  language: string;
  limitations: string[];
  applied: false;
};

type Turn =
  | { id: string; role: "user"; content: string; mode: Mode }
  | ({ id: string; role: "assistant"; mode: "chat" } & ChatResponse)
  | ({ id: string; role: "assistant"; mode: "codegen" } & CodegenResponse);

export function AiWorkspace({
  projects,
  initialProjectId,
  initialFindings,
  credits,
  chatCost,
  codegenCost,
  embedded = false,
}: {
  projects: AiProjectOption[];
  initialProjectId?: string;
  initialFindings?: FindingRow[];
  credits: number;
  chatCost: number;
  codegenCost: number;
  embedded?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [projectId, setProjectId] = useState(
    initialProjectId && projects.some((project) => project.id === initialProjectId)
      ? initialProjectId
      : (projects[0]?.id ?? ""),
  );
  const [findings, setFindings] = useState<FindingRow[]>(
    initialFindings && projectId === initialProjectId ? initialFindings : [],
  );
  const [loadingFindings, setLoadingFindings] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("chat");
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState("typescript");
  const [busy, setBusy] = useState(false);
  const [evidenceConsent, setEvidenceConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [remaining, setRemaining] = useState(credits);
  const logRef = useRef<HTMLDivElement>(null);
  const project = projects.find((item) => item.id === projectId) ?? null;
  const selectedFindings = useMemo(
    () => findings.filter((finding) => selected.includes(finding.id)),
    [findings, selected],
  );

  useEffect(() => {
    setRemaining(credits);
  }, [credits]);

  useEffect(() => {
    if (!projectId) {
      setFindings([]);
      return;
    }
    if (initialFindings && projectId === initialProjectId) {
      setFindings(initialFindings);
      return;
    }

    let cancelled = false;
    setLoadingFindings(true);
    setError(null);

    apiRequest<{ findings: FindingRow[] }>(`/api/v1/projects/${projectId}/findings?limit=50`)
      .then((result) => {
        if (!cancelled) setFindings(result.findings);
      })
      .catch((caught) => {
        if (!cancelled) setError(formatClientError(caught));
      })
      .finally(() => {
        if (!cancelled) setLoadingFindings(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialFindings, initialProjectId, projectId]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  useEffect(() => {
    setEvidenceConsent(false);
  }, [projectId, selected]);

  function changeProject(next: string) {
    setProjectId(next);
    setSelected([]);
    setTurns([]);
    setError(null);
  }

  function toggleFinding(id: string) {
    if (selected.includes(id)) {
      setSelected((current) => current.filter((item) => item !== id));
      return;
    }
    if (selected.length >= 20) {
      toast.push({
        title: "Selection limit reached",
        description: "A single AI request can reference up to 20 findings.",
        tone: "danger",
      });
      return;
    }
    setSelected((current) => (current.includes(id) ? current : [...current, id]));
  }

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!projectId || !prompt.trim() || busy) return;
    if (findings.length > 0 && !evidenceConsent) {
      setError(
        "Approve sending finding evidence to the configured AI provider before sending this request.",
      );
      return;
    }

    const question = prompt.trim();
    setBusy(true);
    setError(null);

    const userTurn: Turn = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      mode,
    };
    setTurns((current) => [...current, userTurn]);
    setPrompt("");

    try {
      const findingIds = selected.length > 0 ? selected : undefined;
      if (mode === "chat") {
        const result = await apiRequest<ChatResponse>(
          `/api/v1/projects/${projectId}/ai/chat`,
          {
            method: "POST",
            body: JSON.stringify({
              question,
              consent_to_send_evidence: evidenceConsent,
              ...(findingIds ? { finding_ids: findingIds } : {}),
            }),
          },
        );
        setTurns((current) => [
          ...current,
          { role: "assistant", mode: "chat", ...result },
        ]);
        setRemaining((current) => Math.max(0, current - result.credits_charged));
      } else {
        const result = await apiRequest<CodegenResponse>(
          `/api/v1/projects/${projectId}/ai/codegen`,
          {
            method: "POST",
            body: JSON.stringify({
              instructions: question,
              language: language.trim() || "text",
              consent_to_send_evidence: evidenceConsent,
              ...(findingIds ? { finding_ids: findingIds } : {}),
            }),
          },
        );
        setTurns((current) => [
          ...current,
          { role: "assistant", mode: "codegen", ...result },
        ]);
        setRemaining((current) => Math.max(0, current - result.credits_charged));
      }
      router.refresh();
    } catch (caught) {
      setError(formatClientError(caught));
      setTurns((current) => current.filter((turn) => turn.id !== userTurn.id));
      setPrompt(question);
    } finally {
      setBusy(false);
      setEvidenceConsent(false);
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
  }

  if (projects.length === 0) {
    return (
      <section className="panel">
        <EmptyState
          action={<ButtonLink href="/projects">Create a project</ButtonLink>}
          description="AI questions are grounded in findings from a specific project. Create one and run an analysis first."
          icon={<IconAi size={21} />}
          title="No project context available"
        />
      </section>
    );
  }

  return (
    <section className={embedded ? undefined : "ai-page"} style={embedded ? { height: 660 } : undefined}>
      <div className="panel" style={{ height: "100%" }}>
        <div className="ai-layout" style={{ border: 0, height: "100%" }}>
          <div className="ai-main">
            <div className="ai-top">
              <div className="ai-mode-switch" role="tablist" aria-label="AI mode">
                <button
                  aria-selected={mode === "chat"}
                  className={mode === "chat" ? "active" : undefined}
                  onClick={() => setMode("chat")}
                  role="tab"
                  type="button"
                >
                  Explain
                </button>
                <button
                  aria-selected={mode === "codegen"}
                  className={mode === "codegen" ? "active" : undefined}
                  onClick={() => setMode("codegen")}
                  role="tab"
                  type="button"
                >
                  Generate code
                </button>
              </div>
              <div className="ai-project-select">
                <span>Project</span>
                <Select
                  aria-label="Project context"
                  disabled={embedded}
                  onChange={(event) => changeProject(event.target.value)}
                  value={projectId}
                >
                  {projects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <Badge mono>{remaining.toLocaleString()} credits</Badge>
                <Button
                  onClick={() => {
                    setTurns([]);
                    setError(null);
                  }}
                  size="sm"
                  variant="quiet"
                >
                  Clear
                </Button>
              </div>
            </div>

            {error ? (
              <div style={{ padding: 12 }}>
                <Notice tone="danger" title="AI request failed">
                  {error}
                </Notice>
              </div>
            ) : null}

            <div className="chat-log" ref={logRef}>
              {turns.length === 0 ? (
                <div className="chat-empty">
                  <div className="chat-empty-mark">
                    <IconAi size={22} />
                  </div>
                  <div className="eyebrow">Evidence-grounded workspace</div>
                  <h2>{mode === "chat" ? "Ask about the evidence" : "Propose reviewable code"}</h2>
                  <p>
                    {selected.length > 0
                      ? `${selected.length} selected findings can be sent as bounded evidence context after you approve below.`
                      : "No findings are selected. The server can use up to 30 of the most recent findings after you approve below."}
                  </p>
                  <div className="row" style={{ justifyContent: "center" }}>
                    <Badge tone="neutral">Chat {chatCost} credits</Badge>
                    <Badge tone="neutral">Codegen {codegenCost} credits</Badge>
                    <Badge tone="neutral">Session-only transcript</Badge>
                  </div>
                </div>
              ) : (
                turns.map((turn) =>
                  turn.role === "user" ? (
                    <div className="chat-message chat-message-user" key={turn.id}>
                      <div className="chat-message-meta">{turn.mode === "chat" ? "Question" : "Instructions"}</div>
                      <div className="chat-bubble">{turn.content}</div>
                    </div>
                  ) : (
                    <AssistantTurn findings={findings} key={turn.id} turn={turn} />
                  ),
                )
              )}
              {busy ? (
                <div className="chat-message chat-message-assistant">
                  <div className="chat-message-meta">
                    <span className="status status-live">
                      <span className="status-dot" /> Reserving credits / contacting provider
                    </span>
                  </div>
                  <div className="chat-bubble">Waiting for the configured AI provider…</div>
                </div>
              ) : null}
            </div>

            <form className="ai-composer" onSubmit={submit}>
              <label className="visually-hidden" htmlFor="ai-prompt">
                {mode === "chat" ? "Question" : "Code generation instructions"}
              </label>
              <textarea
                id="ai-prompt"
                maxLength={8000}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={onComposerKeyDown}
                placeholder={
                  mode === "chat"
                    ? "What does the evidence support about the authentication flow?"
                    : "Write a reviewable TypeScript helper based only on these findings."
                }
                required
                value={prompt}
              />
              {findings.length > 0 ? (
                <label className="checkbox ai-consent">
                  <input
                    checked={evidenceConsent}
                    onChange={(event) => setEvidenceConsent(event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    I approve sending{" "}
                    {selected.length > 0
                      ? `${selected.length} selected finding${selected.length === 1 ? "" : "s"}`
                      : `up to ${Math.min(findings.length, 30)} recent finding${Math.min(findings.length, 30) === 1 ? "" : "s"}`}{" "}
                    to the configured AI provider. Raw source files, target paths, and artifacts are
                    never sent.
                  </span>
                </label>
              ) : (
                <p className="ai-consent ai-consent-empty">
                  No project evidence is available for this request, so only your prompt will be sent.
                </p>
              )}
              <div className="ai-composer-row">
                <span className="ai-composer-hint">
                  {prompt.length}/8000 · {selected.length}/20 findings · ⌘↵ to send
                </span>
                <Button
                  disabled={
                    busy || !prompt.trim() || (findings.length > 0 && !evidenceConsent)
                  }
                  size="sm"
                  type="submit"
                >
                  {busy ? "Working…" : mode === "chat" ? `Ask · ${chatCost} credits` : `Generate · ${codegenCost} credits`}
                  <IconArrowRight size={13} />
                </Button>
              </div>
              {mode === "codegen" ? (
                <div className="row" style={{ marginTop: 8 }}>
                  <span className="ai-composer-hint">Language</span>
                  <input
                    aria-label="Output language"
                    className="input"
                    maxLength={60}
                    onChange={(event) => setLanguage(event.target.value)}
                    style={{ height: 30, minHeight: 30, width: 150 }}
                    value={language}
                  />
                </div>
              ) : null}
            </form>
          </div>

          <aside className="ai-context">
            <div className="ai-context-section">
              <h3>Context</h3>
              <div className="context-project">
                <strong>{project?.name ?? "Select a project"}</strong>
                <span>{loadingFindings ? "Loading findings…" : `${findings.length} findings available`}</span>
              </div>
              <div className="row" style={{ marginTop: 9 }}>
                <Link className="btn btn-quiet btn-sm" href={`/projects/${projectId}`}>
                  Open project <IconArrowRight size={12} />
                </Link>
                <Button
                  onClick={() => router.refresh()}
                  size="sm"
                  variant="quiet"
                  type="button"
                >
                  <IconRefresh size={12} /> Refresh
                </Button>
              </div>
            </div>

            <div className="ai-context-section">
              <h3>Selected evidence / {selectedFindings.length}</h3>
              {findings.length === 0 ? (
                <div className="empty-state empty-state-compact" style={{ minHeight: 120 }}>
                  <p>No findings are available for this project yet.</p>
                </div>
              ) : (
                <div className="context-finding-list">
                  {findings.map((finding) => {
                    const checked = selected.includes(finding.id);
                    return (
                      <label
                        className={checked ? "context-finding selected" : "context-finding"}
                        key={finding.id}
                      >
                        <input
                          checked={checked}
                          onChange={() => toggleFinding(finding.id)}
                          type="checkbox"
                        />
                        <span className="context-finding-copy">
                          <strong>{finding.title}</strong>
                          <span>
                            {finding.class.replaceAll("_", " ")} / {shortId(finding.id, 6)}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              <p className="ai-credit-note">
                {selected.length > 0
                  ? "Only selected findings are included."
                  : "No selection: server uses up to 30 recent findings."}
              </p>
            </div>

            <div className="ai-context-section">
              <h3>Boundaries</h3>
              <ul className="mini-list">
                <li>
                  <span className="row">
                    <IconCheck size={12} /> Answers cite findings
                  </span>
                </li>
                <li>
                  <span className="row">
                    <IconCheck size={12} /> Assumptions shown
                  </span>
                </li>
                <li>
                  <span className="row">
                    <IconAlert size={12} /> Code never executes
                  </span>
                </li>
                <li>
                  <span className="row">
                    <IconAi size={12} /> Provider configured server-side
                  </span>
                </li>
                <li>
                  <span className="row">
                    <IconCheck size={12} /> Source files stay local
                  </span>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function groundingTone(grounding: string): "success" | "warning" | "danger" {
  if (grounding === "evidence") return "success";
  if (grounding === "partial") return "warning";
  return "danger";
}

function AssistantTurn({ turn, findings }: { turn: Extract<Turn, { role: "assistant" }>; findings: FindingRow[] }) {
  const referenced = turn.evidence ?? [];
  const fallback = turn.cited_evidence_ids
    .map((id) => findings.find((finding) => finding.id === id))
    .filter((finding): finding is FindingRow => Boolean(finding));

  return (
    <div className="chat-message chat-message-assistant">
      <div className="chat-message-meta">
        <span>Amethyst / {turn.mode === "chat" ? "analysis" : "code proposal"}</span>
        <Badge tone={groundingTone(turn.grounding)}>{turn.grounding}</Badge>
        <span>{turn.credits_charged} credits</span>
      </div>
      <div className="chat-response">
        <div className="grounding-line">
          <StatusBadge status={turn.grounding} />
          <span className="muted small">
            {turn.mode === "chat"
              ? "Answer is limited to the evidence supplied for this request."
              : "Generated code is a proposal and was not applied or executed."}
          </span>
        </div>
        <p>{turn.answer}</p>

        {turn.mode === "codegen" ? (
          <div className="codegen-result">
            <CodeBlock
              code={turn.code}
              filename={`amethyst-proposal.${turn.language || "txt"}`}
              language={turn.language}
              maxHeight={420}
            />
            <div className="assumptions">
              {turn.limitations.length > 0 ? (
                <>
                  <strong>Limitations</strong>
                  <ul className="plain-list" style={{ marginTop: 6 }}>
                    {turn.limitations.map((limitation) => (
                      <li key={limitation}>
                        <IconAlert size={12} /> <span>{limitation}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {turn.assumptions.length > 0 ? (
          <div className="assumptions">
            <strong>Assumptions</strong>
            <ul className="plain-list" style={{ marginTop: 6 }}>
              {turn.assumptions.map((assumption) => (
                <li key={assumption}>
                  <span>{assumption}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {(referenced.length > 0 || fallback.length > 0) ? (
          <div className="citations">
            {referenced.length > 0
              ? referenced.map((item, index) => (
                  <Link className="citation" href={`/findings/${item.id}`} key={item.id}>
                    <span className="citation-index">{String(index + 1).padStart(2, "0")}</span>
                    <span>
                      {item.title} <Badge tone={classTone(item.class)} mono>{item.class}</Badge>
                    </span>
                  </Link>
                ))
              : fallback.map((item, index) => (
                  <Link className="citation" href={`/findings/${item.id}`} key={item.id}>
                    <span className="citation-index">{String(index + 1).padStart(2, "0")}</span>
                    <span>{item.title}</span>
                  </Link>
                ))}
          </div>
        ) : (
          <p className="assumptions">No evidence citations were returned for this response.</p>
        )}
      </div>
    </div>
  );
}
