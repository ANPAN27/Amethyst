import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverConfig } from "@/lib/config";

export function hasSupabaseConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}

/**
 * Cookie-bound Supabase client. Used only to verify a browser session; data
 * access still goes through RLS or the service-role client with explicit
 * ownership checks.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(serverConfig.supabaseUrl, serverConfig.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Route handlers may be read-only; session refresh is best-effort.
        }
      },
    },
  });
}
