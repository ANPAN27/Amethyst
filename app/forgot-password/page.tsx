import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { ConfigNotice } from "@/components/config-notice";
import { getSessionUser } from "@/lib/server-data";
import { hasSupabaseConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Recover password" };

export default async function ForgotPasswordPage() {
  if (!hasSupabaseConfig()) return <ConfigNotice />;

  const user = await getSessionUser();
  if (user) redirect("/overview");

  return (
    <AuthShell
      title="Recover access"
      description="Enter the email attached to your account. The recovery link is time-limited and single-use."
    >
      <ForgotPasswordForm
        supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
      />
    </AuthShell>
  );
}
