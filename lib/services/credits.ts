import "server-only";

import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type CreditBalance = {
  available: number;
  reserved: number;
  total: number;
};

export type CreditTotals = {
  purchased: number;
  consumed: number;
  entries: number;
};

export async function getCreditBalance(user: User): Promise<CreditBalance> {
  const { data, error } = await getSupabaseAdmin()
    .from("credit_accounts")
    .select("available, reserved")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;

  const available = data?.available ?? 0;
  const reserved = data?.reserved ?? 0;
  return { available, reserved, total: available + reserved };
}

export async function getCreditTotals(userId: string): Promise<CreditTotals> {
  const { data, error } = await getSupabaseAdmin().rpc("credit_totals", {
    p_user_id: userId,
  });

  if (error) {
    console.error("[credits] credit_totals failed", {
      code: error.code ?? "unknown",
      message: error.message ?? "Unknown database error",
    });
    throw new Error("Unable to load credit totals");
  }
  const result = (data ?? {}) as Partial<CreditTotals>;
  return {
    purchased: Number(result.purchased ?? 0),
    consumed: Number(result.consumed ?? 0),
    entries: Number(result.entries ?? 0),
  };
}

export async function reserveCredits(input: {
  userId: string;
  amount: number;
  idempotencyKey: string;
  referenceType: string;
  referenceId: string;
}): Promise<string> {
  const { data, error } = await getSupabaseAdmin().rpc("reserve_credits", {
    p_user_id: input.userId,
    p_amount: input.amount,
    p_idempotency_key: input.idempotencyKey,
    p_reference_type: input.referenceType,
    p_reference_id: input.referenceId,
  });

  if (error) throw error;
  const reservationId = (data as { reservation_id?: string } | null)?.reservation_id;
  if (!reservationId) throw new Error("Credit reservation did not return an id");
  return reservationId;
}

export async function commitCredits(reservationId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("commit_reservation", {
    p_reservation_id: reservationId,
  });
  if (error) throw error;
}

export async function releaseCredits(reservationId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("release_reservation", {
    p_reservation_id: reservationId,
  });
  if (error) throw error;
}

export async function grantCredits(input: {
  userId: string;
  amount: number;
  idempotencyKey: string;
  referenceType: string;
  referenceId: string;
  metadata?: Record<string, unknown>;
}): Promise<{ transactionId: string | null; balanceAfter: number | null; idempotent: boolean }> {
  const { data, error } = await getSupabaseAdmin().rpc("grant_credits", {
    p_user_id: input.userId,
    p_amount: input.amount,
    p_idempotency_key: input.idempotencyKey,
    p_reference_type: input.referenceType,
    p_reference_id: input.referenceId,
    p_metadata: input.metadata ?? {},
  });

  if (error) throw error;
  const result = (data ?? {}) as {
    transaction_id?: string;
    balance_after?: number;
    idempotent?: boolean;
  };

  return {
    transactionId: result.transaction_id ?? null,
    balanceAfter: result.balance_after ?? null,
    idempotent: result.idempotent === true,
  };
}
