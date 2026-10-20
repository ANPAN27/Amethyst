import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient(url: string, anonKey: string) {
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then restart the app.",
    );
  }
  return createBrowserClient(url, anonKey);
}
