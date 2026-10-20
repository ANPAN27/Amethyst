import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { ConfigNotice } from "@/components/config-notice";
import {
  ProjectWorkspace,
  type CompanionRow,
  type FindingRow,
  type JobRow,
  type ProjectDetail,
  type TargetRow,
} from "@/components/project-workspace";
import { createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PageProps = { params: Promise<{ id: string }> };

export default async function ProjectPage({ params }: PageProps) {
  if (!hasSupabaseConfig()) return <ConfigNotice />;

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name, description, created_at")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (projectError) {
    return (
      <main className="container">
        <AppHeader email={user.email ?? null} />
        <div className="alert error">
          Unable to load project: {projectError.message}. Confirm the Supabase migrations have
          been applied.
        </div>
      </main>
    );
  }
  if (!project) notFound();

  const [targetsResult, jobsResult, companionsResult, findingsResult, creditsResult] =
    await Promise.all([
      supabase
        .from("analysis_targets")
        .select("id, kind, label, target_path, created_at")
        .eq("project_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("analysis_jobs")
        .select(
          "id, workflow, status, progress, error_code, error_message, result_summary, created_at, finished_at",
        )
        .eq("project_id", id)
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("companions")
        .select("id, name, platform, version, capabilities, status, paired_at, last_seen_at")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("findings")
        .select("id, job_id, class, category, title, detail, confidence, created_at")
        .eq("project_id", id)
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("credit_accounts")
        .select("available, reserved")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  const loadError =
    targetsResult.error ?? jobsResult.error ?? companionsResult.error ?? findingsResult.error;

  if (loadError) {
    return (
      <main className="container">
        <AppHeader email={user.email ?? null} />
        <div className="alert error">
          Unable to load project data: {loadError.message}. Confirm the Supabase migrations have
          been applied.
        </div>
      </main>
    );
  }

  const available = creditsResult.data?.available ?? 0;
  const reserved = creditsResult.data?.reserved ?? 0;

  return (
    <main className="container">
      <AppHeader email={user.email ?? null} />
      <ProjectWorkspace
        companions={(companionsResult.data ?? []) as CompanionRow[]}
        credits={{ available, reserved, total: available + reserved }}
        findings={(findingsResult.data ?? []) as FindingRow[]}
        jobs={(jobsResult.data ?? []) as JobRow[]}
        project={project as ProjectDetail}
        targets={(targetsResult.data ?? []) as TargetRow[]}
      />
    </main>
  );
}
