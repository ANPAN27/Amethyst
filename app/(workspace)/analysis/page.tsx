import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { JobsDirectory } from "@/components/jobs/jobs-directory";
import { ButtonLink, Metric, PageHeader } from "@/components/ui/primitives";
import { getGlobalJobs, getViewer } from "@/lib/server-data";
import { pluralize } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Analysis" };

export default async function AnalysisPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const data = await getGlobalJobs(viewer.user.id);

  return (
    <div className="page-stack">
      <PageHeader
        actions={<ButtonLink href="/projects" variant="secondary">Choose a project</ButtonLink>}
        description="Every companion job across your projects. Queue work from a project, then inspect status, progress, and stored results here."
        eyebrow="Workspace / analysis"
        meta={
          <>
            <span>{pluralize(data.total, "job")}</span>
            <span>{data.projects.length} projects</span>
            {data.counts.open > 0 ? <span>{data.counts.open} open</span> : <span>No open work</span>}
          </>
        }
        title="Analysis pipeline"
      />
      <div className="metric-grid">
        <Metric label="All jobs" value={data.total.toLocaleString()} detail="Server-recorded work" />
        <Metric label="Open" value={data.counts.open.toLocaleString()} detail="Queued, claimed, or running" />
        <Metric label="Succeeded" value={data.counts.succeeded.toLocaleString()} detail="Completed with artifacts" />
        <Metric label="Failed" value={data.counts.failed.toLocaleString()} detail="Inspect error records" />
        <Metric label="Projects" value={data.projects.length.toLocaleString()} detail="Job owners" href="/projects" />
      </div>
      <JobsDirectory jobs={data.jobs} projects={data.projects} total={data.total} />
    </div>
  );
}
