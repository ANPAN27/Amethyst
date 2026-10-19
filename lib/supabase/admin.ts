import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverConfig } from "@/lib/config";

let cached: SupabaseClient | null = null;

/**
 * Service-role client. Never import this module from client components and
 * never return its results without explicit ownership filtering.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(serverConfig.supabaseUrl, serverConfig.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "X-Client-Info": "amethyst-server" },
    },
  });
  return cached;
}
