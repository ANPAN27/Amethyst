import { redirect } from "next/navigation";
import { ConfigNotice } from "@/components/config-notice";
import { createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!hasSupabaseConfig()) return <ConfigNotice />;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/projects" : "/login");
}
