import { redirect } from "next/navigation";
import { ConfigNotice } from "@/components/config-notice";
import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { getOpenJobCount, getViewer } from "@/lib/server-data";
import { hasSupabaseConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  if (!hasSupabaseConfig()) return <ConfigNotice />;

  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const openJobs = await getOpenJobCount(viewer.user.id);

  return (
    <WorkspaceShell credits={viewer.credits} openJobs={openJobs} profile={viewer.profile}>
      {children}
    </WorkspaceShell>
  );
}
