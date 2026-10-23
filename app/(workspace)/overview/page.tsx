import Link from "next/link";
import type { Metadata } from "next";
import {
  IconAi,
  IconAnalysis,
  IconArrowRight,
  IconClock,
  IconFindings,
  IconProjects,
} from "@/components/icons";
import { CreateProjectButton } from "@/components/projects/project-actions";
import {
  ButtonLink,
  EmptyState,
  Metric,
  PageHeader,
  StatusBadge,
} from "@/components/ui/primitives";
import { getOverviewData, getViewer } from "@/lib/server-data";
import { formatDateTime, pluralize, workflowLabel } from "@/lib/ui";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const data = await getOverviewData(viewer.user.id);
  const projectNames = new Map(data.projects.map((project) => [project.id, project.name]));

  return (
    <div className="page-stack">
      <PageHeader
        actions={
          <>
            <ButtonLink href="/ai" variant="secondary">
              <IconAi size={14} /> AI workspace
            </ButtonLink>
            <CreateProjectButton />
          </>
        }
        description="A live view of projects, local analysis activity, findings, and credit state."
        eyebrow="Workspace / overview"
        meta={
          <>
            <span>{viewer.profile.email ?? "Authenticated session"}</span>
            <span>{pluralize(data.metrics.open, "open job")}</span>
            <span>{pluralize(viewer.credits.available, "credit")} available</span>
          </>
        }
        title="Operations overview"
      />

      <div className="metric-grid">
        <Metric
          detail="Owner-scoped workspaces"
          href="/projects"
          label="Projects"
          value={data.metrics.projects.toLocaleString()}
        />
        <Metric
          detail="Analysis jobs completed"
          href="/analysis"
          label="Completed jobs"
          value={data.metrics.completed.toLocaleString()}
        />
        <Metric
          detail="Queued, claimed, or running"
          href="/analysis"
          label="Active jobs"
          value={data.metrics.open.toLocaleString()}
        />
        <Metric
          detail="Structured observations"
          href="/findings"
          label="Findings"
          value={data.metrics.findings.toLocaleString()}
        />
        <Metric
          detail={`${viewer.credits.reserved.toLocaleString()} reserved`}
          href="/usage"
          label="Credits available"
          value={viewer.credits.available.toLocaleString()}
        />
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Recent analysis</h2>
              <p>Jobs ordered by creation time across all projects.</p>
            </div>
            <Link className="btn btn-quiet btn-sm" href="/analysis">
              All jobs <IconArrowRight size={13} />
            </Link>
          </div>
          {data.recentJobs.length === 0 ? (
            <EmptyState
              compact
              description="Queue an analysis job from a project after pairing a local companion."
              icon={<IconAnalysis size={20} />}
              title="No analysis jobs yet"
            />
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Workflow</th>
                    <th>Project</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {data.recentJobs.map((job) => (
                    <tr key={job.id}>
                      <td className="primary-cell">{workflowLabel(job.workflow)}</td>
                      <td>
                        <Link href={`/projects/${job.project_id}`}>
                          {projectNames.get(job.project_id) ?? "Unknown project"}
                        </Link>
                      </td>
                      <td>
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="mono-cell">{formatDateTime(job.created_at)}</td>
                      <td className="actions-cell">
                        <Link
                          aria-label="Open project"
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
        </section>

        <div className="stack">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Projects</h2>
                <p>Most recently created workspaces.</p>
              </div>
              <Link className="btn btn-quiet btn-sm" href="/projects">
                View all
              </Link>
            </div>
            {data.projects.length === 0 ? (
              <EmptyState
                compact
                description="Create your first project to register targets and queue analysis."
                icon={<IconProjects size={20} />}
                title="No projects yet"
                action={<CreateProjectButton size="sm" label="Create project" />}
              />
            ) : (
              <ul className="activity-list" style={{ padding: "4px 14px" }}>
                {data.projects.slice(0, 4).map((project) => (
                  <li className="activity-item" key={project.id}>
                    <span className="activity-icon">
                      <IconProjects size={14} />
                    </span>
                    <div className="activity-copy">
                      <Link href={`/projects/${project.id}`}>{project.name}</Link>
                      <span>
                        {project.finding_count} findings ·{" "}
                        {project.latest_job
                          ? workflowLabel(project.latest_job.workflow)
                          : "no jobs yet"}
                      </span>
                    </div>
                    {project.latest_job ? (
                      <StatusBadge status={project.latest_job.status} />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Next steps</h2>
                <p>Complete the loop from target to evidence.</p>
              </div>
            </div>
            <div className="panel-body">
              <ul className="mini-list">
                <li>
                  <span className="row">
                    <IconClock size={13} /> Pair a local companion
                  </span>
                  <Link className="label" href="/settings">
                    Settings
                  </Link>
                </li>
                <li>
                  <span className="row">
                    <IconProjects size={13} /> Register a target
                  </span>
                  <Link className="label" href="/projects">
                    Projects
                  </Link>
                </li>
                <li>
                  <span className="row">
                    <IconFindings size={13} /> Review findings
                  </span>
                  <Link className="label" href="/findings">
                    Findings
                  </Link>
                </li>
                <li>
                  <span className="row">
                    <IconAi size={13} /> Ground an AI question
                  </span>
                  <Link className="label" href="/ai">
                    AI
                  </Link>
                </li>
              </ul>
              <div className="divider" style={{ margin: "14px 0" }} />
              <p className="muted small" style={{ margin: 0 }}>
                Open jobs are updated from the server. Refreshing this page reads the current state;
                it does not simulate progress.
              </p>
            </div>
          </section>
        </div>
      </div>

      {data.metrics.open > 0 ? (
        <div className="notice notice-neutral">
          <IconAnalysis className="notice-icon" size={16} />
          <div className="notice-body">
            <strong>{pluralize(data.metrics.open, "active job")}</strong>
            <span>
              Start the paired companion with <code>run</code> to claim queued work. The dashboard
              reflects whatever the server reports.
            </span>
          </div>
          <Link className="btn btn-secondary btn-sm" href="/analysis">
            Inspect jobs
          </Link>
        </div>
      ) : null}
    </div>
  );
}
