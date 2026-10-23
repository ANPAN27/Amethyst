"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { IconArrowRight, IconProjects, IconSearch } from "@/components/icons";
import { ProjectActions } from "@/components/projects/project-actions";
import {
  EmptyState,
  Input,
  Select,
  StatusBadge,
} from "@/components/ui/primitives";
import type { ProjectListItem } from "@/lib/types";
import { formatDate, workflowLabel } from "@/lib/ui";

export function ProjectsDirectory({ projects }: { projects: ProjectListItem[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return projects.filter((project) => {
      if (status === "active" && ["succeeded", "failed", "canceled"].includes(project.latest_job?.status ?? "")) {
        return false;
      }
      if (status === "completed" && project.latest_job?.status !== "succeeded") return false;
      if (status === "attention" && !["failed", "canceled"].includes(project.latest_job?.status ?? "")) {
        return false;
      }
      if (!normalized) return true;
      return [project.name, project.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [projects, query, status]);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Project registry</h2>
          <p>{projects.length} owner-scoped projects</p>
        </div>
      </div>
      <div className="filter-bar">
        <div className="filter-search" style={{ position: "relative" }}>
          <IconSearch
            size={14}
            style={{ left: 10, position: "absolute", top: 9, color: "var(--muted)" }}
          />
          <Input
            aria-label="Search projects"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects…"
            style={{ paddingLeft: 31 }}
            value={query}
          />
        </div>
        <Select
          aria-label="Filter by latest job status"
          className="filter-select"
          onChange={(event) => setStatus(event.target.value)}
          value={status}
        >
          <option value="all">All projects</option>
          <option value="active">With open work</option>
          <option value="completed">Latest job succeeded</option>
          <option value="attention">Needs attention</option>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          compact
          description={
            projects.length === 0
              ? "Create a project to register targets and run local analysis."
              : "No projects match the current search and filter."
          }
          icon={<IconProjects size={20} />}
          title={projects.length === 0 ? "No projects yet" : "No matching projects"}
        />
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Findings</th>
                <th>Latest job</th>
                <th>Updated</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((project) => (
                <tr key={project.id}>
                  <td>
                    <Link className="project-name-cell row-link" href={`/projects/${project.id}`}>
                      <strong>{project.name}</strong>
                      <span>{project.description || "No description"}</span>
                    </Link>
                  </td>
                  <td className="mono-cell">{project.finding_count.toLocaleString()}</td>
                  <td>
                    {project.latest_job ? (
                      <div className="stack-sm" style={{ gap: 5 }}>
                        <StatusBadge status={project.latest_job.status} />
                        <span className="small muted">
                          {workflowLabel(project.latest_job.workflow)}
                        </span>
                      </div>
                    ) : (
                      <span className="muted">No jobs</span>
                    )}
                  </td>
                  <td className="mono-cell">{formatDate(project.updated_at)}</td>
                  <td className="actions-cell">
                    <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                      <Link
                        aria-label={`Open ${project.name}`}
                        className="icon-btn"
                        href={`/projects/${project.id}`}
                      >
                        <IconArrowRight size={15} />
                      </Link>
                      <ProjectActions project={project} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="table-footer">
        <span className="table-footer-meta">
          Showing {filtered.length} of {projects.length} projects
        </span>
        <span className="table-footer-meta">Owner-scoped server reads</span>
      </div>
    </section>
  );
}
