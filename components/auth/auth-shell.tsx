import Link from "next/link";
import type { ReactNode } from "react";
import { IconGraph, IconShield, IconTerminal } from "@/components/icons";

export function AuthShell({
  title,
  description,
  children,
  meta,
}: {
  title: string;
  description: string;
  children: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <main className="auth-page">
      <section className="auth-side">
        <div className="auth-side-top">
          <Link className="sidebar-brand" href="/">
            <span className="brand-mark">A</span>
            <span className="brand-word">
              Amethyst<span>.</span>
            </span>
          </Link>
        </div>
        <div className="auth-side-copy">
          <div className="eyebrow">Evidence-grounded intelligence</div>
          <h1>Understand the system before you change it.</h1>
          <p>
            Pair a local companion, inspect real artifacts, and build a reviewable record of how an
            application works. Every claim stays attached to its evidence.
          </p>
          <div className="steps-grid" style={{ gridTemplateColumns: "1fr", marginTop: 28, gap: 14 }}>
            <div className="step">
              <div className="step-number">
                <IconTerminal size={14} /> LOCAL EXECUTION
              </div>
              <h3>Analysis stays on your machine</h3>
              <p>Targets are inspected by a paired companion, not uploaded through a browser.</p>
            </div>
            <div className="step">
              <div className="step-number">
                <IconGraph size={14} /> STRUCTURED OUTPUT
              </div>
              <h3>Findings carry provenance</h3>
              <p>Observed, verified, inferred, and AI interpretation are kept distinct.</p>
            </div>
            <div className="step">
              <div className="step-number">
                <IconShield size={14} /> PRIVATE BY DEFAULT
              </div>
              <h3>Evidence is signed and access-controlled</h3>
              <p>Artifacts are owner-scoped and delivered through short-lived signed URLs.</p>
            </div>
          </div>
        </div>
        <div className="auth-side-footer">Amethyst / reverse-engineering workspace</div>
      </section>
      <section className="auth-main">
        <div className="auth-card">
          <div className="auth-card-header">
            <div className="eyebrow">Secure workspace</div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          {children}
          {meta ? <div className="auth-meta">{meta}</div> : null}
        </div>
      </section>
    </main>
  );
}
