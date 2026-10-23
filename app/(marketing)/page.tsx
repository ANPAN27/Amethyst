import Link from "next/link";
import type { Metadata } from "next";
import {
  IconAi,
  IconAnalysis,
  IconArrowRight,
  IconCheck,
  IconFindings,
  IconGraph,
  IconLock,
  IconProjects,
  IconShield,
  IconTerminal,
} from "@/components/icons";
import { getSessionUser } from "@/lib/server-data";
import { hasSupabaseConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Amethyst — Evidence-grounded reverse engineering",
  description:
    "Inspect local applications with a paired companion, preserve provenance, and ask AI questions grounded in stored evidence.",
};

const capabilities = [
  {
    index: "01",
    title: "JavaScript applications",
    description:
      "Map entry points, modules, and runtime structure from an authorized local application directory.",
  },
  {
    index: "02",
    title: "SQLite databases",
    description:
      "Inspect schema, tables, and relationships without handing the database file to a model provider.",
  },
  {
    index: "03",
    title: "Go and Rust binaries",
    description:
      "Collect structured observations from compiled executables using the REA workflow on your machine.",
  },
  {
    index: "04",
    title: "Managed artifacts",
    description:
      "Run approved inspection workflows against managed targets while keeping local paths private.",
  },
  {
    index: "05",
    title: "Evidence-first findings",
    description:
      "Observed facts, verified relationships, inference, and AI interpretation remain visibly distinct.",
  },
  {
    index: "06",
    title: "Reviewable AI output",
    description:
      "Chat answers cite stored findings. Generated code is returned for review and is never applied or executed.",
  },
];

const steps = [
  { n: "01", title: "Create a project", body: "Group targets, jobs, findings, and AI work by system." },
  { n: "02", title: "Pair a companion", body: "Use a one-time code to authorize local execution." },
  { n: "03", title: "Add a target", body: "Register an absolute local path for authorized inspection." },
  { n: "04", title: "Queue a job", body: "The companion claims work and streams progress and results." },
  { n: "05", title: "Review evidence", body: "Inspect findings, artifacts, and provenance before acting." },
];

export default async function HomePage() {
  const user = hasSupabaseConfig() ? await getSessionUser() : null;
  const primaryHref = user ? "/overview" : "/signup";
  const primaryLabel = user ? "Open workspace" : "Start a workspace";

  return (
    <div className="marketing">
      <header className="marketing-nav">
        <Link className="sidebar-brand" href="/">
          <span className="brand-mark">A</span>
          <span className="brand-word">
            Amethyst<span>.</span>
          </span>
        </Link>
        <nav aria-label="Primary" className="marketing-nav-links">
          <a href="#capabilities">Capabilities</a>
          <a href="#workflow">Workflow</a>
          <a href="#security">Security</a>
          <a href="#questions">Questions</a>
        </nav>
        <div className="marketing-nav-actions">
          {user ? (
            <Link className="btn btn-secondary btn-sm" href="/overview">
              Workspace
            </Link>
          ) : (
            <Link className="btn btn-ghost btn-sm" href="/login">
              Sign in
            </Link>
          )}
          <Link className="btn btn-primary btn-sm" href={primaryHref}>
            {primaryLabel}
            <IconArrowRight size={14} />
          </Link>
        </div>
      </header>

      <main className="marketing-main">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">Local analysis / connected intelligence</div>
            <h1 className="hero-title">
              Reverse engineering,
              <br />
              <em>with receipts.</em>
            </h1>
            <p className="hero-description">
              Amethyst turns authorized local inspection into a structured, evidence-backed record.
              Pair a companion, run real analysis workflows, and ask AI questions that can only
              answer from stored findings.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary" href={primaryHref}>
                {primaryLabel}
                <IconArrowRight size={15} />
              </Link>
              <Link className="btn btn-secondary" href={user ? "/projects" : "/login"}>
                {user ? "View projects" : "Sign in to existing workspace"}
              </Link>
            </div>
            <div className="row" style={{ gap: 16 }}>
              <span className="hero-note">
                <IconTerminal size={12} /> Local execution
              </span>
              <span className="hero-note">
                <IconShield size={12} /> Owner-scoped evidence
              </span>
              <span className="hero-note">
                <IconLock size={12} /> Signed artifacts
              </span>
            </div>
          </div>

          <div className="hero-visual" aria-label="Amethyst analysis data path">
            <div className="preview-window">
              <div className="preview-top">
                <div className="preview-dots">
                  <span className="preview-dot" />
                  <span className="preview-dot" />
                  <span className="preview-dot" />
                </div>
                <span className="preview-label">Analysis data path</span>
                <span className="preview-label">Private</span>
              </div>
              <div className="preview-body">
                <div className="preview-side">
                  <div className="preview-item preview-item-active">
                    <IconOverviewMark /> Pipeline
                  </div>
                  <div className="preview-item">
                    <IconProjects size={12} /> Project
                  </div>
                  <div className="preview-item">
                    <IconTerminal size={12} /> Companion
                  </div>
                  <div className="preview-item">
                    <IconFindings size={12} /> Findings
                  </div>
                  <div className="preview-item">
                    <IconAi size={12} /> AI
                  </div>
                </div>
                <div className="preview-main">
                  <div className="preview-heading">
                    <div>
                      <h3>Target to evidence</h3>
                      <p>No browser upload / local inspection</p>
                    </div>
                    <span className="badge badge-neutral">REA</span>
                  </div>
                  <div className="preview-panel">
                    <div className="preview-panel-head">
                      <span>01 / Authorized target</span>
                      <span>LOCAL</span>
                    </div>
                    <div className="command-line" style={{ marginTop: 0 }}>
                      ~/src/application
                    </div>
                  </div>
                  <div className="preview-panel">
                    <div className="preview-panel-head">
                      <span>02 / Companion inspection</span>
                      <span>CLAIMED</span>
                    </div>
                    <div className="preview-job">
                      <span>workflow</span>
                      <span>analyze_javascript_application</span>
                    </div>
                    <div className="preview-job">
                      <span>execution</span>
                      <span>paired machine</span>
                    </div>
                    <div className="preview-bar">
                      <span style={{ width: "62%" }} />
                    </div>
                  </div>
                  <div className="preview-panel">
                    <div className="preview-panel-head">
                      <span>03 / Stored output</span>
                      <span>PROVENANCE</span>
                    </div>
                    <div className="preview-finding">
                      <i />
                      <span>observed</span>
                      <span>module structure</span>
                    </div>
                    <div className="preview-finding">
                      <i />
                      <span>verified</span>
                      <span>relationship</span>
                    </div>
                    <div className="preview-finding">
                      <i />
                      <span>inferred</span>
                      <span>entry point</span>
                    </div>
                  </div>
                  <div className="preview-panel">
                    <div className="preview-panel-head">
                      <span>04 / Bounded interpretation</span>
                      <span>EVIDENCE ONLY</span>
                    </div>
                    <div className="preview-job">
                      <span>AI context</span>
                      <span>selected findings</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="marketing-section" id="capabilities">
          <div className="section-number">01 / Capabilities</div>
          <h2 className="marketing-heading">Five inspection paths. One evidence model.</h2>
          <p className="marketing-lede">
            Amethyst is designed around explicit workflows rather than opaque uploads. Every job has
            a target, a companion capability, a status, and a stored result.
          </p>
          <div className="capability-grid">
            {capabilities.map((capability) => (
              <article className="capability-card" key={capability.index}>
                <div className="capability-index">{capability.index}</div>
                <h3>{capability.title}</h3>
                <p>{capability.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="marketing-section" id="workflow">
          <div className="section-number">02 / Workflow</div>
          <h2 className="marketing-heading">A traceable path from target to finding.</h2>
          <p className="marketing-lede">
            The web workspace coordinates the work. The paired companion performs authorized local
            inspection. The backend records state, credit reservations, and artifacts.
          </p>
          <div className="steps-grid">
            {steps.map((step) => (
              <article className="step" key={step.n}>
                <div className="step-number">{step.n}</div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="marketing-section">
          <div className="section-number">03 / Evidence and intelligence</div>
          <div className="marketing-split">
            <div>
              <h2 className="marketing-heading">AI is useful when it knows what it does not know.</h2>
              <p className="marketing-lede">
                Amethyst sends a bounded evidence context to the configured model provider. The
                answer reports grounding, cites finding IDs, and exposes assumptions separately.
              </p>
              <ul className="security-list" style={{ marginTop: 28 }}>
                <li>
                  <IconCheck size={15} />
                  <span>Observed and verified findings are never merged with inference.</span>
                </li>
                <li>
                  <IconCheck size={15} />
                  <span>Generated code is an untrusted proposal, not an applied change.</span>
                </li>
                <li>
                  <IconCheck size={15} />
                  <span>Credit debits are atomic and recorded in an append-only ledger.</span>
                </li>
                <li>
                  <IconCheck size={15} />
                  <span>Local target paths are used by the companion, not as AI evidence.</span>
                </li>
              </ul>
            </div>
            <div className="price-panel">
              <div className="price-row">
                <span>Evidence retrieval</span>
                <strong>Project-scoped</strong>
              </div>
              <div className="price-row">
                <span>AI chat</span>
                <strong>Server-metered</strong>
              </div>
              <div className="price-row">
                <span>Code generation</span>
                <strong>Review only</strong>
              </div>
              <div className="price-row">
                <span>Artifact access</span>
                <strong>Signed URL</strong>
              </div>
              <div className="price-row">
                <span>Graph index</span>
                <strong>Optional / derived</strong>
              </div>
              <div className="price-note">
                Credit costs are configured on the server. Payment providers are optional and only
                enabled when their keys and product mapping are present.
              </div>
            </div>
          </div>
        </section>

        <section className="marketing-section" id="security">
          <div className="section-number">04 / Security posture</div>
          <div className="grid-2">
            <div>
              <h2 className="marketing-heading">The browser is a console, not the analyst.</h2>
              <p className="marketing-lede">
                Project ownership is enforced on every server route. Companion tokens are stored as
                digests. Findings and artifacts are owner-scoped. Evidence downloads expire.
              </p>
            </div>
            <ul className="plain-list">
              <li>
                <IconShield size={15} />
                <div>
                  <strong>Supabase-authenticated sessions</strong>
                  <span className="muted small">
                    Bearer tokens or cookie sessions are verified server-side.
                  </span>
                </div>
              </li>
              <li>
                <IconLock size={15} />
                <div>
                  <strong>Short-lived artifact URLs</strong>
                  <span className="muted small">
                    Evidence is never exposed as a public object path.
                  </span>
                </div>
              </li>
              <li>
                <IconTerminal size={15} />
                <div>
                  <strong>Explicit local execution</strong>
                  <span className="muted small">
                    Companions advertise capabilities and claim only authorized jobs.
                  </span>
                </div>
              </li>
            </ul>
          </div>
        </section>

        <section className="marketing-section" id="questions">
          <div className="section-number">05 / Questions</div>
          <h2 className="marketing-heading">Boundaries, stated plainly.</h2>
          <div className="faq-list">
            <details className="faq-item">
              <summary>Does Amethyst upload my application?</summary>
              <p>
                No. A paired local companion performs the inspection and returns structured output.
                The web app registers targets and coordinates jobs.
              </p>
            </details>
            <details className="faq-item">
              <summary>Can AI answer without evidence?</summary>
              <p>
                It can report that grounding is insufficient. The response format separates
                evidence-backed claims, partial grounding, and assumptions.
              </p>
            </details>
            <details className="faq-item">
              <summary>Does generated code run automatically?</summary>
              <p>
                No. Code is returned for review, copying, or download. Amethyst never applies or
                executes generated code.
              </p>
            </details>
            <details className="faq-item">
              <summary>Is TigerGraph required?</summary>
              <p>
                No. Postgres remains authoritative. TigerGraph is an optional derived index, and the
                rest of the workspace does not depend on it being available.
              </p>
            </details>
            <details className="faq-item">
              <summary>Can I buy credits?</summary>
              <p>
                Only when Dodo Payments is configured by the deployment. The UI does not simulate a
                successful payment or grant credits from a redirect.
              </p>
            </details>
          </div>
        </section>
      </main>

      <footer className="marketing-footer">
        <div className="marketing-footer-top">
          <div>
            <Link className="sidebar-brand" href="/">
              <span className="brand-mark">A</span>
              <span className="brand-word">
                Amethyst<span>.</span>
              </span>
            </Link>
            <p className="muted small" style={{ maxWidth: 380, marginTop: 14 }}>
              Evidence-grounded reverse-engineering workflows for systems you are authorized to
              inspect.
            </p>
          </div>
          <div className="marketing-footer-links">
            <a href="#capabilities">Capabilities</a>
            <a href="#workflow">Workflow</a>
            <a href="#security">Security</a>
            <Link href="/login">Sign in</Link>
            <Link href="/signup">Create account</Link>
          </div>
        </div>
        <div className="marketing-footer-bottom">
          <span>Amethyst / analysis with provenance</span>
          <span>
            <IconAnalysis size={11} /> Local companion required for analysis
          </span>
        </div>
      </footer>
    </div>
  );
}

function IconOverviewMark() {
  return (
    <IconGraph size={12} />
  );
}
