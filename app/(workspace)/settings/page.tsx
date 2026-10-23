import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { IconLock, IconShield, IconTerminal } from "@/components/icons";
import { AccountSecurity } from "@/components/settings/account-security";
import { CompanionSettings } from "@/components/settings/companion-settings";
import { Badge, ButtonLink, PageHeader } from "@/components/ui/primitives";
import { getSettingsData, getViewer } from "@/lib/server-data";
import { formatBytes, formatDate, shortId } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const data = await getSettingsData(viewer.user.id);

  return (
    <div className="page-stack">
      <PageHeader
        actions={<ButtonLink href="/usage" variant="secondary">Usage & credits</ButtonLink>}
        description="Manage local companion access, account security, and the storage posture of your workspace."
        eyebrow="Account / settings"
        title="Settings"
      />

      <div className="settings-grid">
        <div className="stack">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Identity</h2>
                <p>Supabase-authenticated account record.</p>
              </div>
              <Badge tone="success">Authenticated</Badge>
            </div>
            <div className="panel-body">
              <div className="setting-row">
                <span className="setting-row-copy">
                  <strong>Display name</strong>
                  <span>Shown in the workspace shell</span>
                </span>
                <span className="setting-row-value">
                  {viewer.profile.display_name || "Not set"}
                </span>
              </div>
              <div className="setting-row">
                <span className="setting-row-copy">
                  <strong>Email</strong>
                  <span>Recovery and payment identity</span>
                </span>
                <span className="setting-row-value">{viewer.profile.email || "—"}</span>
              </div>
              <div className="setting-row">
                <span className="setting-row-copy">
                  <strong>User ID</strong>
                  <span>Owner scope for all records</span>
                </span>
                <span className="setting-row-value">{shortId(viewer.profile.id, 18)}</span>
              </div>
              <div className="setting-row">
                <span className="setting-row-copy">
                  <strong>Credits</strong>
                  <span>{viewer.credits.reserved} reserved</span>
                </span>
                <span className="setting-row-value">
                  {viewer.credits.available.toLocaleString()} available
                </span>
              </div>
            </div>
          </section>

          <CompanionSettings companions={data.companions} />

          <AccountSecurity
            supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}
            supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
          />
        </div>

        <div className="stack">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Storage posture</h2>
                <p>Evidence handling configured on the server.</p>
              </div>
            </div>
            <div className="panel-body">
              <div className="setting-row">
                <span className="setting-row-copy">
                  <strong>Artifact bucket</strong>
                  <span>Private Supabase storage</span>
                </span>
                <span className="setting-row-value">{data.artifactBucket}</span>
              </div>
              <div className="setting-row">
                <span className="setting-row-copy">
                  <strong>Maximum artifact</strong>
                  <span>Server-enforced upload cap</span>
                </span>
                <span className="setting-row-value">{formatBytes(data.maxArtifactBytes)}</span>
              </div>
              <div className="setting-row">
                <span className="setting-row-copy">
                  <strong>Download URL lifetime</strong>
                  <span>Signed, owner-scoped access</span>
                </span>
                <span className="setting-row-value">5 minutes</span>
              </div>
              <div className="setting-row">
                <span className="setting-row-copy">
                  <strong>AI evidence source</strong>
                  <span>Stored findings only</span>
                </span>
                <span className="setting-row-value">Bounded context</span>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Local execution</h2>
                <p>The companion is the only analysis worker.</p>
              </div>
              <IconTerminal size={16} />
            </div>
            <div className="panel-body">
              <ul className="security-list">
                <li>
                  <IconTerminal size={14} />
                  <span>Companion claims queued jobs using a bearer token digest.</span>
                </li>
                <li>
                  <IconLock size={14} />
                  <span>Target paths are never sent to the configured AI provider.</span>
                </li>
                <li>
                  <IconShield size={14} />
                  <span>Only succeeded jobs with stored artifacts expose signed downloads.</span>
                </li>
              </ul>
              <div className="command-line" style={{ marginTop: 14 }}>
                node companion/dist/cli.js run
              </div>
            </div>
          </section>

          <section className="panel danger-zone">
            <div className="panel-header">
              <div>
                <h2>Data retention</h2>
                <p>Deleting a project removes its records and evidence objects.</p>
              </div>
            </div>
            <div className="panel-body">
              <p className="muted small" style={{ marginBottom: 10 }}>
                Project deletion is permanent. There is no client-side export or archive in this
                build, so download any required artifacts first.
              </p>
              <ButtonLink href="/projects" size="sm" variant="secondary">
                Review projects
              </ButtonLink>
            </div>
          </section>

          <div className="auth-meta" style={{ marginTop: 0 }}>
            Account created {formatDate(viewer.user.created_at)}. All timestamps are displayed in UTC.
          </div>
        </div>
      </div>
    </div>
  );
}
