"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IconAnalysis, IconChevronDown, IconChevronRight } from "@/components/icons";
import { ArtifactDownloadButton } from "@/components/jobs/artifact-download";
import { QueueJobButton } from "@/components/jobs/queue-job-dialog";
import {
  EmptyState,
  StatusBadge,
} from "@/components/ui/primitives";
import { CodeBlock } from "@/components/ui/code-block";
import type { ArtifactRow, CompanionRow, JobRow, TargetRow } from "@/lib/types";
import {
  formatDateTime,
  isLiveJob,
  isOpenJob,
  shortId,
  workflowLabel,
} from "@/lib/ui";

export function ProjectJobsPanel({
  projectId,
  jobs,
  targets,
  companions,
  artifacts,
}: {
  projectId: string;
  jobs: JobRow[];
  targets: TargetRow[];
  companions: CompanionRow[];
  artifacts: ArtifactRow[];
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const open = jobs.some((job) => isOpenJob(job.status));
  const targetNames = new Map(targets.map((target) => [target.id, target.label]));
  const artifactJobs = new Set(artifacts.map((artifact) => artifact.job_id));

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [open, router]);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Analysis jobs</h2>
          <p>
            {jobs.length} recorded jobs
            {open ? " / auto-refreshing while work is open" : ""}
          </p>
        </div>
        <QueueJobButton companions={companions} projectId={projectId} targets={targets} />
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          compact
          action={
            <QueueJobButton companions={companions} projectId={projectId} targets={targets} />
          }
          description={
            targets.length === 0
              ? "Register a target first, then queue a compatible workflow."
              : companions.some((companion) => companion.status === "active")
                ? "Queue a workflow for a paired companion to claim."
                : "Pair an active companion from Settings before queueing work."
          }
          icon={<IconAnalysis size={20} />}
          title="No analysis jobs"
        />
      ) : (
        <ul className="job-list">
          {jobs.map((job) => {
            const isExpanded = expanded === job.id;
            return (
              <li className={isLiveJob(job.status) ? "job-item job-live" : "job-item"} key={job.id}>
                <div className="job-item-head">
                  <div style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <h3>{workflowLabel(job.workflow)}</h3>
                      <span className="mono small muted">{shortId(job.id)}</span>
                    </div>
                    <p>
                      {job.target_id ? targetNames.get(job.target_id) ?? "Target removed" : "No target"} ·{" "}
                      {formatDateTime(job.created_at)}
                    </p>
                  </div>
                  <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                    <StatusBadge status={job.status} />
                    <button
                      aria-expanded={isExpanded}
                      aria-label="Toggle job details"
                      className="icon-btn"
                      onClick={() => setExpanded(isExpanded ? null : job.id)}
                      type="button"
                    >
                      {isExpanded ? <IconChevronDown size={15} /> : <IconChevronRight size={15} />}
                    </button>
                  </div>
                </div>
                <div className="job-progress" aria-label={`${job.progress}% complete`}>
                  <span style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }} />
                </div>
                <div className="row spread" style={{ marginTop: 6 }}>
                  <span className="mono small muted">{job.progress}% complete</span>
                  <span className="mono small muted">
                    {job.finished_at ? `finished ${formatDateTime(job.finished_at)}` : "not finished"}
                  </span>
                </div>
                {job.error_message ? (
                  <div className="job-error">
                    {job.error_code ? `${job.error_code}: ` : ""}
                    {job.error_message}
                  </div>
                ) : null}
                {isExpanded ? (
                  <div className="stack" style={{ marginTop: 12 }}>
                    <div className="stat-strip" style={{ margin: 0, gridTemplateColumns: "repeat(3, 1fr)" }}>
                      <div className="stat-cell">
                        <span>Companion</span>
                        <strong className="mono small">
                          {job.companion_id ? shortId(job.companion_id) : "—"}
                        </strong>
                      </div>
                      <div className="stat-cell">
                        <span>Started</span>
                        <strong className="mono small">{formatDateTime(job.started_at)}</strong>
                      </div>
                      <div className="stat-cell">
                        <span>Artifact</span>
                        <strong className="mono small">{artifactJobs.has(job.id) ? "stored" : "none"}</strong>
                      </div>
                    </div>
                    {job.result_summary ? (
                      <CodeBlock
                        code={JSON.stringify(job.result_summary, null, 2)}
                        filename="result-summary.json"
                        language="json"
                        maxHeight={260}
                      />
                    ) : (
                      <p className="muted small">No result summary recorded for this job.</p>
                    )}
                    {job.status === "succeeded" && artifactJobs.has(job.id) ? (
                      <div className="evidence-actions">
                        <ArtifactDownloadButton jobId={job.id} />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <div className="panel-footer" style={{ justifyContent: "space-between" }}>
        <span className="table-footer-meta">
          {open ? "Live polling active" : "Server state / no polling"}
        </span>
        <button className="btn btn-quiet btn-sm" onClick={() => router.refresh()} type="button">
          Refresh now
        </button>
      </div>
    </section>
  );
}
