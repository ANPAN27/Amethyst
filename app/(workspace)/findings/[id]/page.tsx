import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  IconAi,
  IconAnalysis,
  IconArrowRight,
  IconDownload,
  IconFindings,
} from "@/components/icons";
import { ArtifactDownloadButton } from "@/components/jobs/artifact-download";
import { CopyButton } from "@/components/ui/code-block";
import {
  Badge,
  ButtonLink,
  EmptyState,
  StatusBadge,
} from "@/components/ui/primitives";
import { getFindingData, getViewer } from "@/lib/server-data";
import {
  classTone,
  confidenceLabel,
  formatBytes,
  formatDateTime,
  shortId,
  statusLabel,
  workflowLabel,
} from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Finding" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PageProps = { params: Promise<{ id: string }> };

export default async function FindingPage({ params }: PageProps) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const data = await getFindingData(viewer.user.id, id);
  if (!data) notFound();

  const { finding, project, job, artifact } = data;
  const evidence = Array.isArray(finding.evidence) ? finding.evidence : [];

  return (
    <div className="page-stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <nav aria-label="Breadcrumb" className="breadcrumbs">
          <Link href="/findings">Findings</Link>
          <span className="breadcrumb-separator">/</span>
          <Link href={`/projects/${project.id}`}>{project.name}</Link>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-current">{shortId(finding.id)}</span>
        </nav>
        <ButtonLink href={`/ai?project=${project.id}`} variant="secondary" size="sm">
          <IconAi size={13} /> Ask in AI workspace
        </ButtonLink>
      </div>

      <div className="finding-detail-layout">
        <article className="finding-hero">
          <div className="row" style={{ gap: 8 }}>
            <StatusBadge status={finding.class} />
            {finding.category ? <Badge mono>{finding.category}</Badge> : null}
            <Badge mono>{confidenceLabel(finding.confidence)} confidence</Badge>
          </div>
          <h1>{finding.title}</h1>
          <p>{finding.detail || "No detail was recorded for this finding."}</p>

          <div className="finding-meta-strip">
            <div>
              <span>Project</span>
              <strong><Link href={`/projects/${project.id}`}>{project.name}</Link></strong>
            </div>
            <div>
              <span>Finding class</span>
              <strong>{statusLabel(finding.class)}</strong>
            </div>
            <div>
              <span>Confidence</span>
              <strong>{confidenceLabel(finding.confidence)}</strong>
            </div>
            <div>
              <span>Recorded</span>
              <strong>{formatDateTime(finding.created_at)}</strong>
            </div>
            <div>
              <span>Job</span>
              <strong>{shortId(finding.job_id, 12)}</strong>
            </div>
          </div>

          <section className="evidence-json">
            <div className="row spread" style={{ marginBottom: 9 }}>
              <h2 style={{ fontSize: 13 }}>Evidence payload</h2>
              <CopyButton value={JSON.stringify(finding.evidence, null, 2)} label="Copy JSON" />
            </div>
            {evidence.length > 0 || (finding.evidence && typeof finding.evidence === "object") ? (
              <pre>{JSON.stringify(finding.evidence, null, 2)}</pre>
            ) : (
              <EmptyState
                compact
                description="The companion submitted this finding without an evidence array."
                title="No structured evidence"
              />
            )}
          </section>
        </article>

        <aside className="stack">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Provenance</h2>
                <p>How this record entered the workspace.</p>
              </div>
            </div>
            <div className="panel-body">
              <div className="setting-row">
                <span className="setting-row-copy">
                  <strong>Class</strong>
                  <span>Never inferred from styling</span>
                </span>
                <Badge tone={classTone(finding.class)} mono>{finding.class}</Badge>
              </div>
              <div className="setting-row">
                <span className="setting-row-copy">
                  <strong>Job status</strong>
                  <span>Companion execution</span>
                </span>
                <span className="setting-row-value">
                  {job ? <StatusBadge status={job.status} /> : "Job removed"}
                </span>
              </div>
              <div className="setting-row">
                <span className="setting-row-copy">
                  <strong>Workflow</strong>
                  <span>Analysis capability</span>
                </span>
                <span className="setting-row-value">
                  {job ? workflowLabel(job.workflow) : "Unknown"}
                </span>
              </div>
              <div className="setting-row">
                <span className="setting-row-copy">
                  <strong>Finding ID</strong>
                  <span>Stable identifier</span>
                </span>
                <span className="setting-row-value">{shortId(finding.id, 14)}</span>
              </div>
            </div>
            <div className="panel-footer" style={{ justifyContent: "stretch" }}>
              <ButtonLink
                href={`/projects/${project.id}?tab=jobs`}
                variant="secondary"
                size="sm"
                style={{ width: "100%" }}
              >
                <IconAnalysis size={13} /> Open job history
              </ButtonLink>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Evidence artifact</h2>
                <p>Private output for the producing job.</p>
              </div>
            </div>
            <div className="panel-body">
              {artifact ? (
                <>
                  <div className="setting-row">
                    <span className="setting-row-copy">
                      <strong>Size</strong>
                      <span>Stored object</span>
                    </span>
                    <span className="setting-row-value">{formatBytes(artifact.size_bytes)}</span>
                  </div>
                  <div className="setting-row">
                    <span className="setting-row-copy">
                      <strong>Content type</strong>
                      <span>Signed access</span>
                    </span>
                    <span className="setting-row-value">{artifact.content_type}</span>
                  </div>
                  <div className="evidence-sha" style={{ marginTop: 10 }}>
                    sha256: {artifact.sha256}
                  </div>
                  <div className="evidence-actions">
                    <ArtifactDownloadButton jobId={finding.job_id} label="Download artifact" />
                  </div>
                </>
              ) : (
                <EmptyState
                  compact
                  description="No artifact is registered for the producing job."
                  icon={<IconDownload size={18} />}
                  title="No artifact"
                />
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Continue analysis</h2>
                <p>Use this finding as context.</p>
              </div>
            </div>
            <div className="panel-body stack-sm">
              <Link className="btn btn-secondary btn-sm" href={`/projects/${project.id}?tab=findings`}>
                <IconFindings size={13} /> All project findings <IconArrowRight size={12} />
              </Link>
              <Link className="btn btn-quiet btn-sm" href={`/projects/${project.id}?tab=ai`}>
                <IconAi size={13} /> Project AI context <IconArrowRight size={12} />
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
