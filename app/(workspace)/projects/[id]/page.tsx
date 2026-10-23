import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ProjectWorkspace } from "@/components/projects/project-workspace";
import { getProjectPageData, getViewer } from "@/lib/server-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Project" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function ProjectPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const data = await getProjectPageData(viewer.user.id, id);
  if (!data) notFound();

  const { tab } = await searchParams;

  return <ProjectWorkspace data={data} initialTab={tab} />;
}
