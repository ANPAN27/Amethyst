import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AiWorkspace } from "@/components/ai/ai-workspace";
import { ButtonLink, PageHeader } from "@/components/ui/primitives";
import { getAiProjectOptions, getProjectPageData, getViewer } from "@/lib/server-data";
import { pluralize } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "AI workspace" };

type PageProps = {
  searchParams: Promise<{ project?: string }>;
};

export default async function AiPage({ searchParams }: PageProps) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const params = await searchParams;
  const options = await getAiProjectOptions(viewer.user.id);
  const selectedId = options.find((project) => project.id === params.project)?.id;
  const initial = selectedId
    ? await getProjectPageData(viewer.user.id, selectedId)
    : options[0]
      ? await getProjectPageData(viewer.user.id, options[0].id)
      : null;

  return (
    <div className="page-stack">
      <PageHeader
        actions={<ButtonLink href="/projects" variant="secondary">Browse projects</ButtonLink>}
        description="Ask questions against stored findings, or ask for reviewable code proposals. Answers are bounded by the evidence context and credit balance."
        eyebrow="Intelligence / AI workspace"
        meta={
          <>
            <span>Chat {pluralize(initial?.chat_cost ?? 0, "credit")}</span>
            <span>Codegen {pluralize(initial?.codegen_cost ?? 0, "credit")}</span>
            <span>{options.length} projects available</span>
          </>
        }
        title="AI workspace"
      />
      <AiWorkspace
        chatCost={initial?.chat_cost ?? 0}
        codegenCost={initial?.codegen_cost ?? 0}
        credits={viewer.credits.available}
        initialFindings={initial?.findings}
        initialProjectId={selectedId ?? options[0]?.id}
        projects={options}
      />
    </div>
  );
}
