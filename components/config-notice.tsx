import Link from "next/link";
import { IconAlert, IconArrowRight } from "@/components/icons";

const REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

export function ConfigNotice() {
  const missing = REQUIRED.filter((name) => !process.env[name]?.trim());

  return (
    <main className="grid-pattern" style={{ minHeight: "100vh" }}>
      <div className="setup-card">
        <div className="eyebrow">Deployment configuration</div>
        <h1>Amethyst needs Supabase to open the workspace.</h1>
        <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
          The dashboard authenticates with Supabase and every data query is owner-scoped. Copy{" "}
          <code>.env.example</code> to <code>.env.local</code>, set the values below, then restart
          the app.
        </p>
        <div className="notice notice-warning" style={{ marginTop: 18 }}>
          <IconAlert className="notice-icon" size={16} />
          <div className="notice-body">
            <strong>Missing public configuration</strong>
            <span>{missing.length > 0 ? missing.join(", ") : "Configuration was detected."}</span>
          </div>
        </div>
        <div className="setup-list">
          <div>
            <span>NEXT_PUBLIC_SUPABASE_URL</span>
            <span>{process.env.NEXT_PUBLIC_SUPABASE_URL ? "present" : "missing"}</span>
          </div>
          <div>
            <span>NEXT_PUBLIC_SUPABASE_ANON_KEY</span>
            <span>{process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "present" : "missing"}</span>
          </div>
          <div>
            <span>Server-only secrets</span>
            <span>required by API routes</span>
          </div>
          <div>
            <span>Reference</span>
            <span>docs/DEPLOYMENT.md</span>
          </div>
        </div>
        <div className="row" style={{ marginTop: 22 }}>
          <Link className="btn btn-secondary" href="/">
            Return to overview
            <IconArrowRight size={14} />
          </Link>
        </div>
      </div>
    </main>
  );
}
