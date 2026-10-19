import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/api/errors";

/**
 * Durable, cross-instance rate limiting backed by Postgres. Callers must pass a
 * user-derived key so one account cannot exhaust another account's budget.
 */
export async function enforceRateLimit(
  userId: string,
  action: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const { data, error } = await getSupabaseAdmin().rpc("consume_rate_limit", {
    p_bucket: `${action}:${userId}`,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) throw error;
  if (data !== true) {
    throw new ApiError(429, "rate_limited", "Too many requests. Try again later.", {
      retryAfterSeconds: windowSeconds,
    });
  }
}
