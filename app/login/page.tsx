import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { ConfigNotice } from "@/components/config-notice";
import { Notice } from "@/components/ui/primitives";
import { getSessionUser } from "@/lib/server-data";
import { hasSupabaseConfig } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in" };

type PageProps = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  if (!hasSupabaseConfig()) return <ConfigNotice />;

  const params = await searchParams;
  const nextPath = safeNextPath(params.next, "/overview");
  const user = await getSessionUser();
  if (user) redirect(nextPath);

  return (
    <AuthShell
      title="Sign in to Amethyst"
      description="Access owner-scoped projects, local analysis jobs, evidence, and AI workspaces."
    >
      {params.error ? (
        <Notice tone="danger" title="Authentication could not be completed">
          The link may be expired or already used. Sign in, or request a new recovery email.
        </Notice>
      ) : null}
      <AuthForm
        mode="signin"
        nextPath={nextPath}
        supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
      />
    </AuthShell>
  );
}
