"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { IconSearch } from "@/components/icons";
import {
  Badge,
  EmptyState,
  Input,
  Select,
  StatusBadge,
} from "@/components/ui/primitives";
import type { FindingRow } from "@/lib/types";
import {
  classTone,
  confidenceLabel,
  filterFindings,
  formatDate,
  paginate,
  pluralize,
  totalPages,
} from "@/lib/ui";

export function FindingsBrowser({
  findings,
  projects,
  showProject = false,
  pageSize = 20,
  total,
}: {
  findings: FindingRow[];
  projects?: { id: string; name: string }[];
  showProject?: boolean;
  pageSize?: number;
  total?: number;
}) {
  const [query, setQuery] = useState("");
  const [findingClass, setFindingClass] = useState("all");
  const [projectId, setProjectId] = useState("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () => filterFindings(findings, { query, findingClass, projectId }),
    [findingClass, findings, projectId, query],
  );
  const pages = totalPages(filtered.length, pageSize);
  const currentPage = Math.min(page, pages);
  const visible = paginate(filtered, currentPage, pageSize);
  const projectNames = useMemo(
    () => new Map((projects ?? []).map((project) => [project.id, project.name])),
    [projects],
  );

  return (
    <section className="panel">
      <div className="filter-bar">
        <div className="filter-search" style={{ position: "relative" }}>
          <IconSearch
            size={14}
            style={{ color: "var(--muted)", left: 10, position: "absolute", top: 9 }}
          />
          <Input
            aria-label="Search findings"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search title, detail, category…"
            style={{ paddingLeft: 31 }}
            value={query}
          />
        </div>
        <Select
          aria-label="Filter by finding class"
          className="filter-select"
          onChange={(event) => {
            setFindingClass(event.target.value);
            setPage(1);
          }}
          value={findingClass}
        >
          <option value="all">All classes</option>
          <option value="observed">Observed</option>
          <option value="verified_relationship">Verified relationship</option>
          <option value="inferred">Inferred</option>
          <option value="ai_interpretation">AI interpretation</option>
          <option value="proposed_code">Proposed code</option>
        </Select>
        {showProject && projects ? (
          <Select
            aria-label="Filter by project"
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
        ) : null}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          compact
          description={
            findings.length === 0
              ? "A completed companion job will publish findings here."
              : "No findings match the current search and filters."
          }
          title={findings.length === 0 ? "No findings yet" : "No matching findings"}
        />
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {showProject ? <th>Project</th> : null}
                <th>Finding</th>
                <th>Class</th>
                <th>Confidence</th>
                <th>Recorded</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((finding) => (
                <tr key={finding.id}>
                  {showProject ? (
                    <td>
                      <Link href={`/projects/${finding.project_id}`}>
                        {projectNames.get(finding.project_id) ?? "Unknown project"}
                      </Link>
                    </td>
                  ) : null}
                  <td>
                    <Link className="project-name-cell row-link" href={`/findings/${finding.id}`}>
                      <strong>{finding.title}</strong>
                      <span>
                        {finding.category || finding.detail || "No category or detail"}
                      </span>
                    </Link>
                  </td>
                  <td>
                    <StatusBadge label={undefined} status={finding.class} />
                  </td>
                  <td>
                    <Badge tone={classTone(finding.class)} mono>
                      {confidenceLabel(finding.confidence)}
                    </Badge>
                  </td>
                  <td className="mono-cell">{formatDate(finding.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="table-footer">
        <span className="table-footer-meta">
          {total !== undefined && total > findings.length
            ? `Latest ${pluralize(findings.length, "finding")} of ${pluralize(total, "total finding")}`
            : `${pluralize(filtered.length, "finding")} / ${pluralize(total ?? findings.length, "total finding")}`}
        </span>
        {pages > 1 ? (
          <div className="pagination">
            <button
              className="btn btn-quiet btn-sm"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
              type="button"
            >
              Previous
            </button>
            <span>
              {currentPage} / {pages}
            </span>
            <button
              className="btn btn-quiet btn-sm"
              disabled={currentPage >= pages}
              onClick={() => setPage(currentPage + 1)}
              type="button"
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
