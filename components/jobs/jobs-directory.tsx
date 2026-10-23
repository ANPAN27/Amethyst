"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { IconAnalysis, IconArrowRight, IconSearch } from "@/components/icons";
import { EmptyState, Input, Select, StatusBadge } from "@/components/ui/primitives";
import type { JobWithProject, ProjectSummary } from "@/lib/types";
import { formatDateTime, isOpenJob, paginate, pluralize, totalPages, workflowLabel } from "@/lib/ui";

export function JobsDirectory({
  jobs,
  projects,
  total,
}: {
  jobs: JobWithProject[];
  projects: ProjectSummary[];
  total?: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [projectId, setProjectId] = useState("all");
  const [page, setPage] = useState(1);
  const hasOpen = jobs.some((job) => isOpenJob(job.status));

  useEffect(() => {
    if (!hasOpen) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [hasOpen, router]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return jobs.filter((job) => {
      if (status === "open" && !isOpenJob(job.status)) return false;
      if (status !== "all" && status !== "open" && job.status !== status) return false;
      if (projectId !== "all" && job.project_id !== projectId) return false;
      if (!normalized) return true;
      return [job.project_name, job.workflow, job.id]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [jobs, projectId, query, status]);

  const pages = totalPages(filtered.length, 20);
  const currentPage = Math.min(page, pages);
  const visible = paginate(filtered, currentPage, 20);

  return (
    <section className="panel">
      <div className="filter-bar">
        <div className="filter-search" style={{ position: "relative" }}>
          <IconSearch
            size={14}
            style={{ color: "var(--muted)", left: 10, position: "absolute", top: 9 }}
          />
          <Input
            aria-label="Search jobs"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search project, workflow, job id…"
            style={{ paddingLeft: 31 }}
            value={query}
          />
        </div>
        <Select
          aria-label="Filter job status"
          className="filter-select"
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          value={status}
        >
          <option value="all">All statuses</option>
          <option value="open">Open work</option>
          <option value="queued">Queued</option>
          <option value="claimed">Claimed</option>
          <option value="running">Running</option>
          <option value="succeeded">Succeeded</option>
          <option value="failed">Failed</option>
          <option value="canceled">Canceled</option>
        </Select>
        <Select
          aria-label="Filter project"
          className="filter-select"
          onChange={(event) => {
            setProjectId(event.target.value);
            setPage(1);
          }}
          value={projectId}
        >
          <option value="all">All projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          compact
          description={
            jobs.length === 0
              ? "Open a project, register a target, and queue a workflow for a paired companion."
              : "No jobs match the current filters."
          }
          icon={<IconAnalysis size={20} />}
          title={jobs.length === 0 ? "No analysis jobs" : "No matching jobs"}
        />
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Workflow</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Created</th>
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {visible.map((job) => (
                <tr key={job.id}>
                  <td>
                    <Link className="primary-cell" href={`/projects/${job.project_id}`}>
                      {job.project_name}
                    </Link>
                  </td>
                  <td>
                    <div className="project-name-cell">
                      <strong>{workflowLabel(job.workflow)}</strong>
                      <span className="mono">{job.id.slice(0, 8)}</span>
                    </div>
                  </td>
                  <td><StatusBadge status={job.status} /></td>
                  <td className="mono-cell">{job.progress}%</td>
                  <td className="mono-cell">{formatDateTime(job.created_at)}</td>
                  <td className="actions-cell">
                    <Link
                      aria-label="Open project jobs"
                      className="icon-btn"
                      href={`/projects/${job.project_id}?tab=jobs`}
                    >
                      <IconArrowRight size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="table-footer">
        <span className="table-footer-meta">
          {total !== undefined && total > jobs.length
            ? `Latest ${pluralize(jobs.length, "job")} of ${pluralize(total, "total job")}`
            : `${pluralize(filtered.length, "job")} / ${pluralize(total ?? jobs.length, "total job")}`}
          {hasOpen ? " / polling open work" : ""}
        </span>
        <div className="pagination">
          <button
            className="btn btn-quiet btn-sm"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
            type="button"
          >
            Previous
          </button>
          <span>{currentPage} / {pages}</span>
          <button
            className="btn btn-quiet btn-sm"
            disabled={currentPage >= pages}
            onClick={() => setPage(currentPage + 1)}
            type="button"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
