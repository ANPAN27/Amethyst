import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { ConfigNotice } from "@/components/config-notice";
import { Notice } from "@/components/ui/primitives";
import { getSessionUser } from "@/lib/server-data";
import { hasSupabaseConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Set a new password" };

export default async function ResetPasswordPage() {
  if (!hasSupabaseConfig()) return <ConfigNotice />;

  const user = await getSessionUser();

  return (
    <AuthShell
      title="Set a new password"
      description="Choose a new password for your Amethyst account. Existing sessions remain valid until they expire or are signed out."
    >
      {user ? (
        <ResetPasswordForm
          supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}
          supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
        />
      ) : (
        <div className="stack">
          <Notice tone="warning" title="Recovery session required">
            Open the recovery link from your email first. If it expired, request a new one.
          </Notice>
          <Link className="btn btn-secondary" href="/forgot-password">
            Request a new link
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
