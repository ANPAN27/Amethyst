import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreateProjectButton } from "@/components/projects/project-actions";
import { ProjectsDirectory } from "@/components/projects/projects-directory";
import { PageHeader } from "@/components/ui/primitives";
import { getProjectsView, getViewer } from "@/lib/server-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const projects = await getProjectsView(viewer.user.id);

  return (
    <div className="page-stack">
      <PageHeader
        actions={<CreateProjectButton />}
        description="Each project groups local targets, companion jobs, findings, evidence, and AI work."
        eyebrow="Workspace / projects"
        meta={
          <>
            <span>{projects.length} projects</span>
            <span>
              {projects.reduce((total, project) => total + project.finding_count, 0)} findings
            </span>
          </>
        }
        title="Projects"
      />
      <ProjectsDirectory projects={projects} />
    </div>
  );
}
