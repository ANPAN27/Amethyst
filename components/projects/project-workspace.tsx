"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  IconAi,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconFindings,
  IconRefresh,
} from "@/components/icons";
import { AiWorkspace } from "@/components/ai/ai-workspace";
import { FindingsBrowser } from "@/components/findings/findings-browser";
import { ArtifactDownloadButton } from "@/components/jobs/artifact-download";
import { ProjectJobsPanel } from "@/components/jobs/project-jobs";
import { AddTargetButton } from "@/components/projects/add-target-dialog";
import { ProjectActions } from "@/components/projects/project-actions";
import { CodeBlock } from "@/components/ui/code-block";
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  StatusBadge,
} from "@/components/ui/primitives";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import type { ProjectPageData } from "@/lib/types";
import {
  formatBytes,
  formatDate,
  formatDateTime,
  pluralize,
  shortId,
  statusLabel,
  targetKindLabel,
  workflowLabel,
} from "@/lib/ui";

type ProjectTab = "overview" | "targets" | "jobs" | "findings" | "evidence" | "ai";

const VALID_TABS: ProjectTab[] = ["overview", "targets", "jobs", "findings", "evidence", "ai"];

export function ProjectWorkspace({
  data,
  initialTab = "overview",
}: {
  data: ProjectPageData;
  initialTab?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<ProjectTab>(
    VALID_TABS.includes(initialTab as ProjectTab) ? (initialTab as ProjectTab) : "overview",
  );
  const [refreshing, setRefreshing] = useState(false);
  const { project, targets, jobs, companions, findings, artifacts, credits } = data;
  const activeCompanions = companions.filter((companion) => companion.status === "active");

  useEffect(() => {
    const url = new URL(window.location.href);
    if (tab === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [tab]);

  const tabs: TabItem<ProjectTab>[] = [
    { id: "overview", label: "Overview" },
    { id: "targets", label: "Targets", count: targets.length },
    { id: "jobs", label: "Jobs", count: jobs.length },
    { id: "findings", label: "Findings", count: findings.length },
    { id: "evidence", label: "Evidence", count: artifacts.length },
    { id: "ai", label: "AI" },
  ];

  function refresh() {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 700);
  }

  return (
    <div className="page-stack">
      <div className="project-head">
        <div className="project-head-copy">
          <div className="eyebrow">Projects / {shortId(project.id)}</div>
          <h1>{project.name}</h1>
          <p>{project.description || "No project description has been recorded."}</p>
          <div className="project-head-meta">
            <span className="label">Created {formatDate(project.created_at)}</span>
            <span className="label">Updated {formatDate(project.updated_at)}</span>
            <span className="label">{pluralize(credits.available, "credit")}</span>
            <span className="label">{pluralize(activeCompanions.length, "active companion", "active companions")}</span>
          </div>
        </div>
        <div className="project-head-actions">
          <Button disabled={refreshing} onClick={refresh} variant="secondary">
            <IconRefresh size={14} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
          <ButtonLink href={`/ai?project=${project.id}`} variant="secondary">
            <IconAi size={14} /> Ask AI
          </ButtonLink>
          <ProjectActions project={project} redirectOnDelete />
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat-cell">
          <span>Targets</span>
          <strong>{targets.length.toLocaleString()}</strong>
        </div>
        <div className="stat-cell">
          <span>Jobs</span>
          <strong>{jobs.length.toLocaleString()}</strong>
        </div>
        <div className="stat-cell">
          <span>Findings</span>
          <strong>{findings.length.toLocaleString()}</strong>
        </div>
        <div className="stat-cell">
          <span>Evidence artifacts</span>
          <strong>{artifacts.length.toLocaleString()}</strong>
        </div>
      </div>

      <Tabs
        ariaLabel="Project sections"
        className="project-tabs"
        items={tabs}
        onChange={setTab}
        value={tab}
      />

      {tab === "overview" ? (
        <OverviewPanel data={data} onOpenTab={setTab} />
      ) : null}

      {tab === "targets" ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Analysis targets</h2>
              <p>Local targets selected on the machine that runs your companion.</p>
            </div>
            <AddTargetButton projectId={project.id} />
          </div>
          {targets.length === 0 ? (
            <EmptyState
              action={<AddTargetButton label="Select first target" projectId={project.id} variant="primary" />}
              description="Use the companion to select a local application folder, database, or binary. The path is validated on that machine."
              icon={<IconFindings size={20} />}
              title="No targets registered"
            />
          ) : (
            <ul className="target-list" style={{ padding: 14 }}>
              {targets.map((target) => (
                <li className="target-item" key={target.id}>
                  <div className="target-item-head">
                    <div>
                      <h3>{target.label}</h3>
                      <p>{targetKindLabel(target.kind)}</p>
                    </div>
                    <Badge mono>{target.kind}</Badge>
                  </div>
                  <div className="target-path">{target.target_path}</div>
                  <div className="finding-meta">
                    <span>Added {formatDate(target.created_at)}</span>
                    <span>Digest {target.target_digest ? shortId(target.target_digest, 16) : "not recorded"}</span>
                    {Object.keys(target.metadata ?? {}).length > 0 ? (
                      <span>{Object.keys(target.metadata).length} metadata fields</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {activeCompanions.length === 0 ? (
            <div className="panel-footer" style={{ justifyContent: "space-between" }}>
              <span className="muted small">No active companion can claim registered targets.</span>
              <ButtonLink href="/settings" size="sm" variant="secondary">
                Pair a companion
              </ButtonLink>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "jobs" ? (
        <ProjectJobsPanel
          artifacts={artifacts}
          companions={companions}
          jobs={jobs}
          projectId={project.id}
          targets={targets}
        />
      ) : null}

      {tab === "findings" ? (
        <FindingsBrowser findings={findings} pageSize={25} />
      ) : null}

      {tab === "evidence" ? <EvidencePanel data={data} /> : null}

      {tab === "ai" ? (
        <AiWorkspace
          chatCost={data.chat_cost}
          codegenCost={data.codegen_cost}
          credits={credits.available}
          embedded
          initialFindings={findings}
          initialProjectId={project.id}
          projects={[{ id: project.id, name: project.name }]}
        />
      ) : null}
    </div>
  );
}

function OverviewPanel({
  data,
  onOpenTab,
}: {
  data: ProjectPageData;
  onOpenTab: (tab: ProjectTab) => void;
}) {
  const { project, targets, jobs, companions, findings, artifacts } = data;
  const activeCompanions = companions.filter((companion) => companion.status === "active");

  return (
    <div className="project-overview-grid">
      <div className="project-section">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Analysis readiness</h2>
              <p>The minimum requirements for a real companion job.</p>
            </div>
          </div>
          <div className="panel-body">
            <ul className="mini-list">
              <li>
                <span className="row">
                  {targets.length > 0 ? <IconCheck size={14} /> : <IconClock size={14} />}
                  Target registered
                </span>
                <span>{targets.length} total</span>
              </li>
              <li>
                <span className="row">
                  {activeCompanions.length > 0 ? <IconCheck size={14} /> : <IconClock size={14} />}
                  Companion paired
                </span>
                <Link href="/settings">{activeCompanions.length} active</Link>
              </li>
              <li>
                <span className="row">
                  {jobs.length > 0 ? <IconCheck size={14} /> : <IconClock size={14} />}
                  Job recorded
                </span>
                <span>{jobs.length} total</span>
              </li>
              <li>
                <span className="row">
                  {findings.length > 0 ? <IconCheck size={14} /> : <IconClock size={14} />}
                  Findings available
                </span>
                <span>{findings.length} findings</span>
              </li>
              <li>
                <span className="row">
                  {artifacts.length > 0 ? <IconCheck size={14} /> : <IconClock size={14} />}
                  Evidence artifact stored
                </span>
                <span>{artifacts.length} artifacts</span>
              </li>
            </ul>
            <div className="row" style={{ marginTop: 16 }}>
              <AddTargetButton projectId={project.id} />
              <Button onClick={() => onOpenTab("jobs")} variant="secondary" size="sm">
                Analyze / inspect jobs <IconArrowRight size={13} />
              </Button>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Recent jobs</h2>
              <p>Latest companion work recorded for this project.</p>
            </div>
            <Button onClick={() => onOpenTab("jobs")} size="sm" variant="quiet">
              All jobs
            </Button>
          </div>
          {jobs.length === 0 ? (
            <EmptyState compact description="No jobs have been queued for this project." title="No jobs yet" />
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Workflow</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.slice(0, 5).map((job) => (
                    <tr key={job.id}>
                      <td className="primary-cell">{workflowLabel(job.workflow)}</td>
                      <td><StatusBadge status={job.status} /></td>
                      <td className="mono-cell">{job.progress}%</td>
                      <td className="mono-cell">{formatDateTime(job.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Recent findings</h2>
              <p>Evidence-backed records from completed work.</p>
            </div>
            <Button onClick={() => onOpenTab("findings")} size="sm" variant="quiet">
              Inspect findings
            </Button>
          </div>
          {findings.length === 0 ? (
            <EmptyState
              compact
              description="Findings appear only after the companion submits a result."
              title="No findings yet"
            />
          ) : (
            <ul className="finding-list" style={{ padding: 14 }}>
              {findings.slice(0, 4).map((finding) => (
                <li className="finding-item" key={finding.id}>
                  <div className="finding-title-line">
                    <Link href={`/findings/${finding.id}`}>{finding.title}</Link>
                    <StatusBadge status={finding.class} />
                  </div>
                  <p>{finding.detail || finding.category || "No detail recorded."}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="stack">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Brief</h2>
              <p>Owner-visible project context.</p>
            </div>
          </div>
          <div className="panel-body">
            <p className="muted small" style={{ lineHeight: 1.7 }}>
              {project.description || "No description recorded. Edit the project to add context."}
            </p>
            <div className="divider" style={{ margin: "14px 0" }} />
            <div className="setting-row">
              <span className="setting-row-copy">
                <strong>Project ID</strong>
                <span>Stable server identifier</span>
              </span>
              <span className="setting-row-value">{shortId(project.id, 12)}</span>
            </div>
            <div className="setting-row">
              <span className="setting-row-copy">
                <strong>AI chat cost</strong>
                <span>Reserved before each run</span>
              </span>
              <span className="setting-row-value">{pluralize(data.chat_cost, "credit")}</span>
            </div>
            <div className="setting-row">
              <span className="setting-row-copy">
                <strong>Codegen cost</strong>
                <span>Review-only output</span>
              </span>
              <span className="setting-row-value">{pluralize(data.codegen_cost, "credit")}</span>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Companions</h2>
              <p>Local workers authorized for this account.</p>
            </div>
            <ButtonLink href="/settings" size="sm" variant="quiet">
              Manage
            </ButtonLink>
          </div>
          <div className="panel-body">
            {companions.length === 0 ? (
              <EmptyState
                compact
                description="Pair the local companion before queueing work."
                title="No companions paired"
                action={<ButtonLink href="/settings" size="sm">Open settings</ButtonLink>}
              />
            ) : (
              <ul className="mini-list">
                {companions.slice(0, 4).map((companion) => (
                  <li key={companion.id}>
                    <span className="row">
                      <span className={`status status-${companion.status === "active" ? "success" : "danger"}`}>
                        <span className="status-dot" />
                        {statusLabel(companion.status)}
                      </span>
                      {companion.name}
                    </span>
                    <span>{companion.capabilities.length} workflows</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function EvidencePanel({ data }: { data: ProjectPageData }) {
  const jobWorkflows = new Map(data.jobs.map((job) => [job.id, job.workflow]));

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Evidence artifacts</h2>
          <p>
            Immutable outputs stored in the private artifact bucket. Downloads use short-lived signed
            URLs.
          </p>
        </div>
        <Badge tone="neutral" mono>
          {data.artifacts.length} stored
        </Badge>
      </div>
      {data.artifacts.length === 0 ? (
        <EmptyState
          compact
          description="A succeeded companion job with an artifact reference will appear here."
          title="No evidence artifacts"
        />
      ) : (
        <ul className="evidence-list" style={{ padding: 14 }}>
          {data.artifacts.map((artifact) => (
            <li className="evidence-item" key={artifact.job_id}>
              <div className="evidence-item-head">
                <div>
                  <h3>{jobWorkflows.get(artifact.job_id) ? workflowLabel(jobWorkflows.get(artifact.job_id)!) : "Analysis output"}</h3>
                  <p>
                    {formatBytes(artifact.size_bytes)} · {artifact.content_type} ·{" "}
                    {formatDateTime(artifact.created_at)}
                  </p>
                </div>
                <ArtifactDownloadButton jobId={artifact.job_id} />
              </div>
              <div className="evidence-sha">sha256: {artifact.sha256}</div>
              <div className="finding-meta">
                <span>Job {shortId(artifact.job_id)}</span>
                <span>Signed access</span>
                <span>Owner-scoped</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="panel-footer" style={{ justifyContent: "flex-start" }}>
        <span className="muted small">
          Artifacts are not sent to the AI provider in full. AI context uses stored finding evidence.
        </span>
      </div>
      {data.artifacts.length > 0 ? (
        <div className="panel-body" style={{ paddingTop: 0 }}>
          <CodeBlock
            code={JSON.stringify(
              data.artifacts.map((artifact) => ({
                job_id: artifact.job_id,
                sha256: artifact.sha256,
                size_bytes: artifact.size_bytes,
                content_type: artifact.content_type,
              })),
              null,
              2,
            )}
            filename="artifact-manifest.json"
            language="json"
            maxHeight={220}
          />
        </div>
      ) : null}
    </section>
  );
}
