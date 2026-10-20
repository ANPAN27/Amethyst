import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { ConfigNotice } from "@/components/config-notice";
import { createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!hasSupabaseConfig()) return <ConfigNotice />;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/projects");

  return (
    <main className="container narrow">
      <div className="header">
        <div className="brand">
          Amethyst<span>.</span>
        </div>
      </div>
      <h1>Sign in</h1>
      <p className="muted">
        Amethyst analyzes applications through a paired local companion. Start by signing in to
        create a project.
      </p>
      <AuthForm
        supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
      />
    </main>
  );
}
