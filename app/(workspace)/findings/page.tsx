import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FindingsBrowser } from "@/components/findings/findings-browser";
import { ButtonLink, Metric, PageHeader } from "@/components/ui/primitives";
import { getGlobalFindings, getViewer } from "@/lib/server-data";
import { pluralize } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Findings" };

export default async function FindingsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const data = await getGlobalFindings(viewer.user.id);
  const observed = data.classCounts.observed ?? 0;
  const verified = data.classCounts.verified_relationship ?? 0;
  const inferred = data.classCounts.inferred ?? 0;
  const ai = data.classCounts.ai_interpretation ?? 0;
  const limited = data.total > data.findings.length;

  return (
    <div className="page-stack">
      <PageHeader
        actions={<ButtonLink href="/analysis" variant="secondary">Inspect jobs</ButtonLink>}
        description="Search the evidence trail across projects. Finding classes are preserved so observed facts are never mistaken for interpretation."
        eyebrow="Workspace / findings"
        meta={
          <>
            <span>{pluralize(data.total, "finding")}</span>
            {limited ? <span>Latest {data.findings.length} loaded</span> : null}
            <span>{data.projects.length} projects</span>
          </>
        }
        title="Findings"
      />
      <div className="metric-grid">
        <Metric label="All findings" value={data.total.toLocaleString()} detail="Across projects" />
        <Metric label="Observed" value={observed.toLocaleString()} detail="Direct inspection output" />
        <Metric label="Verified" value={verified.toLocaleString()} detail="Confirmed relationships" />
        <Metric label="Inferred" value={inferred.toLocaleString()} detail="Reasoned, not observed" />
        <Metric label="AI interpretation" value={ai.toLocaleString()} detail="Model-authored context" />
      </div>
      <FindingsBrowser
        findings={data.findings}
        pageSize={25}
        projects={data.projects}
        showProject
        total={data.total}
      />
    </div>
  );
}
