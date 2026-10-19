import "server-only";

import { createHash } from "node:crypto";
import DodoPayments from "dodopayments";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { serverConfig, getCreditProduct, publicConfig } from "@/lib/config";
import { ApiError } from "@/lib/api/errors";
import { grantCredits } from "@/lib/services/credits";

export class PermanentWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentWebhookError";
  }
}

let client: DodoPayments | null = null;

function getDodoClient(): DodoPayments {
  if (client) return client;
  client = new DodoPayments({
    bearerToken: serverConfig.dodo.apiKey,
    environment: serverConfig.dodo.environment as "test_mode" | "live_mode",
  });
  return client;
}

export async function createCreditCheckout(user: User, productId: string) {
  const product = getCreditProduct(productId);
  if (!product) {
    throw new ApiError(400, "invalid_request", "Unknown credit product");
  }

  const admin = getSupabaseAdmin();
  const { data: checkoutRow, error: insertError } = await admin
    .from("checkout_sessions")
    .insert({
      user_id: user.id,
      provider: "dodo",
      product_id: productId,
      credits: product.credits,
      status: "created",
    })
    .select("id")
    .single();

  if (insertError || !checkoutRow) throw insertError ?? new Error("Failed to create checkout");

  try {
    const session = await getDodoClient().checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: {
        email: user.email ?? `user-${user.id}@users.amethyst.invalid`,
      },
      return_url: `${publicConfig.appUrl}/billing/return`,
      cancel_url: `${publicConfig.appUrl}/billing/cancel`,
      metadata: {
        user_id: user.id,
        checkout_session_id: checkoutRow.id,
        product_id: productId,
        credits: String(product.credits),
      },
    });

    await admin
      .from("checkout_sessions")
      .update({ provider_session_id: session.session_id })
      .eq("id", checkoutRow.id);

    return {
      checkout_url: session.checkout_url,
      provider_session_id: session.session_id,
      product_id: productId,
      credits: product.credits,
    };
  } catch (error) {
    await admin
      .from("checkout_sessions")
      .update({ status: "failed" })
      .eq("id", checkoutRow.id);
    throw new ApiError(503, "upstream_unavailable", "Unable to create a checkout session", {
      provider: "dodo",
      cause: error instanceof Error ? error.name : "unknown",
    });
  }
}

const paymentEventSchema = z.object({
  type: z.string().min(1).max(120),
  data: z
    .object({
      payment_id: z.string().min(1).max(200).optional(),
      id: z.string().min(1).max(200).optional(),
      status: z.string().max(40).optional(),
      total_amount: z.number().int().nonnegative().optional(),
      amount: z.number().int().nonnegative().optional(),
      currency: z.string().max(8).optional(),
      checkout_session_id: z.string().max(200).optional(),
      metadata: z.record(z.unknown()).optional(),
      product_cart: z
        .array(
          z
            .object({
              product_id: z.string().max(200),
              quantity: z.number().int().positive().optional(),
            })
            .passthrough(),
        )
        .optional(),
    })
    .passthrough(),
});

function metadataString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function markEvent(
  id: string,
  status: "received" | "processed" | "failed",
  errorMessage?: string,
) {
  const admin = getSupabaseAdmin();
  const { data: current } = await admin
    .from("webhook_events")
    .select("attempts")
    .eq("id", id)
    .maybeSingle();

  await admin
    .from("webhook_events")
    .update({
      status,
      attempts: (current?.attempts ?? 0) + 1,
      last_error: errorMessage?.slice(0, 2000) ?? null,
      ...(status === "processed" ? { processed_at: new Date().toISOString() } : {}),
    })
    .eq("id", id);
}

/**
 * Idempotent Dodo webhook processing. Credits are granted exactly once using
 * the provider payment id as the ledger idempotency key.
 */
export async function processDodoWebhook(input: {
  webhookId: string;
  eventType: string;
  rawBody: string;
  payload: unknown;
}): Promise<{ result: string }> {
  const admin = getSupabaseAdmin();
  const payloadHash = createHash("sha256").update(input.rawBody).digest("hex");

  const { data: inserted, error: insertError } = await admin
    .from("webhook_events")
    .insert({
      id: input.webhookId,
      provider: "dodo",
      event_type: input.eventType,
      status: "received",
      payload_sha256: payloadHash,
      attempts: 0,
    })
    .select("id")
    .maybeSingle();

  if (insertError && insertError.code !== "23505") throw insertError;

  const { data: eventRow, error: readError } = await admin
    .from("webhook_events")
    .select("status")
    .eq("id", input.webhookId)
    .single();

  if (readError) throw readError;
  if (!inserted && eventRow?.status === "processed") {
    return { result: "duplicate" };
  }

  try {
    const parsed = paymentEventSchema.safeParse(input.payload);
    if (!parsed.success) {
      throw new PermanentWebhookError("Unrecognized webhook payload");
    }

    const event = parsed.data;
    const normalizedType = input.eventType || event.type;

    if (normalizedType !== "payment.succeeded") {
      await markEvent(input.webhookId, "processed");
      return { result: "ignored" };
    }

    const paymentId = event.data.payment_id ?? event.data.id;
    if (!paymentId) {
      throw new PermanentWebhookError("Missing payment id");
    }
    if (event.data.status && event.data.status !== "succeeded") {
      await markEvent(input.webhookId, "processed");
      return { result: "ignored_status" };
    }

    const metadata = event.data.metadata ?? {};
    const metadataUserId = metadataString(metadata.user_id);
    const metadataCheckoutId = metadataString(metadata.checkout_session_id);
    const providerCheckoutId = event.data.checkout_session_id ?? null;

    let checkout: {
      id: string;
      user_id: string;
      product_id: string;
      credits: number;
    } | null = null;

    if (metadataCheckoutId) {
      const { data, error } = await admin
        .from("checkout_sessions")
        .select("id, user_id, product_id, credits")
        .eq("id", metadataCheckoutId)
        .maybeSingle();
      if (error) throw error;
      checkout = data;
    }

    if (!checkout && providerCheckoutId) {
      const { data, error } = await admin
        .from("checkout_sessions")
        .select("id, user_id, product_id, credits")
        .eq("provider_session_id", providerCheckoutId)
        .maybeSingle();
      if (error) throw error;
      checkout = data;
    }

    if (!checkout) {
      throw new PermanentWebhookError("No matching checkout session");
    }

    if (metadataUserId && metadataUserId !== checkout.user_id) {
      throw new PermanentWebhookError("Checkout user does not match webhook metadata");
    }

    const product = getCreditProduct(checkout.product_id);
    if (!product) {
      throw new PermanentWebhookError("Purchased product is not configured for credits");
    }

    const { error: paymentError } = await admin.from("payments").upsert(
      {
        user_id: checkout.user_id,
        provider: "dodo",
        provider_payment_id: paymentId,
        checkout_session_id: checkout.id,
        product_id: checkout.product_id,
        credits: product.credits,
        amount: event.data.total_amount ?? event.data.amount ?? null,
        currency: event.data.currency ?? null,
        status: "succeeded",
        metadata: {
          webhook_id: input.webhookId,
          provider_checkout_id: providerCheckoutId,
        },
      },
      { onConflict: "provider_payment_id" },
    );

    if (paymentError) throw paymentError;

    const grant = await grantCredits({
      userId: checkout.user_id,
      amount: product.credits,
      idempotencyKey: `dodo:payment:${paymentId}`,
      referenceType: "purchase",
      referenceId: paymentId,
      metadata: { checkout_session_id: checkout.id, product_id: checkout.product_id },
    });

    await admin
      .from("checkout_sessions")
      .update({ status: "completed" })
      .eq("id", checkout.id);

    await markEvent(input.webhookId, "processed");

    return { result: grant.idempotent ? "duplicate_grant" : "granted" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 2000) : "Webhook processing failed";
    await markEvent(input.webhookId, "failed", message);
    throw error;
  }
}
