import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { ConfigNotice } from "@/components/config-notice";
import { ProjectsClient, type ProjectSummary } from "@/components/projects-client";
import { createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  if (!hasSupabaseConfig()) return <ConfigNotice />;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("projects")
    .select("id, name, description, created_at, updated_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <main className="container">
      <AppHeader email={user.email ?? null} />
      <div className="card-header">
        <div>
          <h1>Projects</h1>
          <p className="muted" style={{ margin: 0 }}>
            Each project groups local analysis targets, companion jobs, findings, and AI answers.
          </p>
        </div>
      </div>

      {error ? (
        <div className="alert error">
          Unable to load projects: {error.message}. Confirm the Supabase migrations have been
          applied.
        </div>
      ) : null}

      <ProjectsClient projects={(data ?? []) as ProjectSummary[]} />
    </main>
  );
}
