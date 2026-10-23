import type { Metadata } from "next";
import Link from "next/link";
import { IconFindings, IconGraph, IconShield, IconTerminal } from "@/components/icons";
import {
  Badge,
  ButtonLink,
  Notice,
  PageHeader,
} from "@/components/ui/primitives";
import { serverConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Graph" };

export default function GraphPage() {
  const configured = serverConfig.tigerGraph.enabled;

  return (
    <div className="page-stack">
      <PageHeader
        actions={<ButtonLink href="/findings" variant="secondary"><IconFindings size={14} /> Review findings</ButtonLink>}
        description="TigerGraph is an optional, derived relationship index. Postgres remains authoritative and the workspace does not depend on graph availability."
        eyebrow="Intelligence / graph"
        meta={
          <>
            <span>Graph / {serverConfig.tigerGraph.graph}</span>
            <span>{configured ? "Endpoint configured" : "Endpoint not configured"}</span>
          </>
        }
        title="Relationship graph"
      />

      {configured ? (
        <Notice tone="warning" title="Graph endpoint configured, explorer deferred">
          The backend can sync stored graph payloads and answer neighbor queries, but this build does
          not expose an interactive graph canvas. Findings, evidence, and project history remain
          fully available.
        </Notice>
      ) : (
        <Notice tone="neutral" title="Graph indexing is off">
          No <code>TIGERGRAPH_URL</code> is configured. Jobs still run, findings are stored in
          Postgres, and evidence downloads are unaffected.
        </Notice>
      )}

      <section className="unavailable-shell">
        <div className="unavailable-grid" />
        <div className="unavailable-inner">
          <div className="unavailable-mark">
            <IconGraph size={26} />
          </div>
          <div className="eyebrow">Optional derived index</div>
          <h2>{configured ? "Graph explorer is not enabled in this interface" : "Graph index unavailable"}</h2>
          <p>
            Amethyst stores application records and findings in Postgres first. A graph sync is a
            secondary projection used for relationship queries; it never replaces the evidence
            record.
          </p>
          <div className="unavailable-diagram">
            <span>Postgres</span>
            <i />
            <span>Graph sync</span>
            <i />
            <span>TigerGraph</span>
            <i />
            <span>Optional query</span>
          </div>
          <div className="row" style={{ justifyContent: "center", marginTop: 8 }}>
            <Badge tone={configured ? "success" : "warning"}>
              {configured ? "Configured / deferred" : "Not configured"}
            </Badge>
            <Badge mono>Derived / rebuildable</Badge>
          </div>
          <div className="row" style={{ justifyContent: "center", marginTop: 10 }}>
            <ButtonLink href="/findings" variant="secondary" size="sm">
              Inspect stored findings
            </ButtonLink>
            <ButtonLink href="/projects" size="sm">
              Open a project
            </ButtonLink>
          </div>
        </div>
      </section>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>What the graph would index</h2>
              <p>Derived relationships, not source evidence.</p>
            </div>
          </div>
          <div className="panel-body">
            <ul className="mini-list">
              <li><span>Entities submitted by a succeeded job</span><Badge mono>Vertices</Badge></li>
              <li><span>Relationships with explicit provenance</span><Badge mono>Edges</Badge></li>
              <li><span>Sync status per job</span><Badge mono>Pending / succeeded</Badge></li>
              <li><span>Owner-scoped project boundary</span><Badge mono>Isolated</Badge></li>
            </ul>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Why it is separate</h2>
              <p>Availability should never block analysis.</p>
            </div>
          </div>
          <div className="panel-body">
            <ul className="security-list">
              <li>
                <IconTerminal size={14} />
                <span>Jobs and findings are committed to Postgres before any graph sync.</span>
              </li>
              <li>
                <IconShield size={14} />
                <span>Graph payloads are stored with the job and can be rebuilt later.</span>
              </li>
              <li>
                <IconGraph size={14} />
                <span>Neighbor queries are bounded by depth and project ownership.</span>
              </li>
            </ul>
            <p className="muted small" style={{ marginTop: 14 }}>
              See <Link href="/analysis">Analysis</Link> for job state and{" "}
              <Link href="/findings">Findings</Link> for the authoritative evidence trail.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
