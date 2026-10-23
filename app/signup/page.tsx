import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { ConfigNotice } from "@/components/config-notice";
import { getSessionUser } from "@/lib/server-data";
import { hasSupabaseConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage() {
  if (!hasSupabaseConfig()) return <ConfigNotice />;

  const user = await getSessionUser();
  if (user) redirect("/overview");

  return (
    <AuthShell
      title="Create your workspace"
      description="Start with a project, pair a local companion, and keep every analysis finding tied to evidence."
      meta={
        <>
          By creating an account you agree to use Amethyst only on systems you are authorized to
          inspect. Local target paths are never sent to an AI provider.
        </>
      }
    >
      <AuthForm
        mode="signup"
        supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
      />
    </AuthShell>
  );
}
