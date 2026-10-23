import "server-only";

import { createHash } from "node:crypto";
import DodoPayments from "dodopayments";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { dodoConfigured, getCreditProduct, publicConfig, serverConfig } from "@/lib/config";
import { ApiError } from "@/lib/api/errors";
import { grantCredits } from "@/lib/services/credits";

export class PermanentWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentWebhookError";
  }
}

type CheckoutRow = {
  id: string;
  user_id: string;
  product_id: string;
  credits: number;
  provider_session_id: string | null;
  expected_amount: number | null;
  expected_currency: string | null;
  status: string;
};

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
  if (!dodoConfigured()) {
    throw new ApiError(503, "upstream_unavailable", "Payments are not configured");
  }

  const dodo = getDodoClient();
  let providerProduct: Awaited<ReturnType<typeof dodo.products.retrieve>>;
  try {
    providerProduct = await dodo.products.retrieve(productId);
  } catch (error) {
    throw new ApiError(503, "upstream_unavailable", "Unable to load the credit product", {
      provider: "dodo",
      cause: error instanceof Error ? error.name : "unknown",
    });
  }

  const price = providerProduct.price;
  if (price.type !== "one_time_price") {
    throw new ApiError(400, "invalid_request", "Credit products must use a one-time price");
  }

  const discountBps =
    typeof price.discount_bps === "number"
      ? price.discount_bps
      : typeof price.discount === "number"
        ? price.discount * 100
        : 0;
  const expectedAmount = Math.floor(price.price * (1 - discountBps / 10_000));

  if (!Number.isInteger(expectedAmount) || expectedAmount <= 0) {
    throw new ApiError(400, "invalid_request", "Credit product price must be positive");
  }

  const admin = getSupabaseAdmin();
  const { data: checkoutRow, error: insertError } = await admin
    .from("checkout_sessions")
    .insert({
      user_id: user.id,
      provider: "dodo",
      product_id: productId,
      credits: product.credits,
      expected_amount: expectedAmount,
      expected_currency: price.currency,
      status: "created",
    })
    .select("id")
    .single();

  if (insertError || !checkoutRow) throw insertError ?? new Error("Failed to create checkout");

  try {
    const session = await dodo.checkoutSessions.create(
      {
        product_cart: [{ product_id: productId, quantity: 1 }],
        customer: {
          email: user.email ?? `user-${user.id}@users.amethyst.invalid`,
        },
        billing_currency: price.currency,
        return_url: `${publicConfig.appUrl}/billing/return`,
        cancel_url: `${publicConfig.appUrl}/billing/cancel`,
        metadata: {
          user_id: user.id,
          checkout_session_id: checkoutRow.id,
          product_id: productId,
          credits: String(product.credits),
        },
      },
      { idempotencyKey: `credit-checkout:${checkoutRow.id}` },
    );

    if (!session.checkout_url) {
      throw new Error("Dodo did not return a checkout URL");
    }

    const { error: updateError } = await admin
      .from("checkout_sessions")
      .update({ provider_session_id: session.session_id })
      .eq("id", checkoutRow.id);

    if (updateError) throw updateError;

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
      invoice_url: z.string().url().max(2000).optional(),
      payment_method: z.string().max(80).optional(),
      card_last_four: z.string().max(8).optional(),
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
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

async function markEvent(
  id: string,
  status: "received" | "processed" | "failed",
  errorMessage?: string,
) {
  const admin = getSupabaseAdmin();
  const { data: current, error: readError } = await admin
    .from("webhook_events")
    .select("attempts")
    .eq("id", id)
    .maybeSingle();

  if (readError) throw readError;

  const { error } = await admin
    .from("webhook_events")
    .update({
      status,
      attempts: (current?.attempts ?? 0) + 1,
      last_error: errorMessage?.slice(0, 2000) ?? null,
      ...(status === "processed" ? { processed_at: new Date().toISOString() } : {}),
    })
    .eq("id", id);

  if (error) throw error;
}

async function findCheckout(
  column: "id" | "provider_session_id",
  value: string,
): Promise<CheckoutRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("checkout_sessions")
    .select(
      "id, user_id, product_id, credits, provider_session_id, expected_amount, expected_currency, status",
    )
    .eq(column, value)
    .maybeSingle();

  if (error) throw error;
  return data as CheckoutRow | null;
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
    const normalizedType = event.type || input.eventType;

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
    const metadataProductId = metadataString(metadata.product_id);
    const metadataCredits = metadataString(metadata.credits);
    const providerCheckoutId = event.data.checkout_session_id ?? null;

    const checkoutByMetadata = metadataCheckoutId
      ? await findCheckout("id", metadataCheckoutId)
      : null;
    if (metadataCheckoutId && !checkoutByMetadata) {
      throw new PermanentWebhookError("No matching checkout session");
    }

    const checkoutByProvider = providerCheckoutId
      ? await findCheckout("provider_session_id", providerCheckoutId)
      : null;

    if (
      checkoutByMetadata &&
      checkoutByProvider &&
      checkoutByMetadata.id !== checkoutByProvider.id
    ) {
      throw new PermanentWebhookError("Checkout identifiers do not match");
    }

    const checkout = checkoutByMetadata ?? checkoutByProvider;
    if (!checkout) {
      throw new PermanentWebhookError("No matching checkout session");
    }

    const { data: checkoutPayments, error: checkoutPaymentsError } = await admin
      .from("payments")
      .select("provider_payment_id")
      .eq("checkout_session_id", checkout.id);

    if (checkoutPaymentsError) throw checkoutPaymentsError;
    if (
      (checkoutPayments ?? []).some(
        (payment) => payment.provider_payment_id !== paymentId,
      )
    ) {
      throw new PermanentWebhookError("Checkout already has a different payment");
    }

    if (
      checkout.provider_session_id &&
      providerCheckoutId &&
      checkout.provider_session_id !== providerCheckoutId
    ) {
      throw new PermanentWebhookError("Provider checkout id does not match");
    }

    if (metadataUserId && metadataUserId !== checkout.user_id) {
      throw new PermanentWebhookError("Checkout user does not match webhook metadata");
    }
    if (metadataProductId && metadataProductId !== checkout.product_id) {
      throw new PermanentWebhookError("Checkout product does not match webhook metadata");
    }
    if (metadataCredits && Number(metadataCredits) !== checkout.credits) {
      throw new PermanentWebhookError("Checkout credits do not match webhook metadata");
    }

    const configuredProduct = getCreditProduct(checkout.product_id);
    if (!configuredProduct) {
      throw new PermanentWebhookError("Unknown credit product");
    }
    if (configuredProduct.credits !== checkout.credits) {
      throw new PermanentWebhookError("Credit product mapping changed");
    }

    const totalAmount = event.data.total_amount ?? event.data.amount;
    if (
      typeof totalAmount !== "number" ||
      !Number.isInteger(totalAmount) ||
      totalAmount <= 0
    ) {
      throw new PermanentWebhookError("Missing payment amount");
    }

    const currency = event.data.currency?.toUpperCase();
    if (!currency) {
      throw new PermanentWebhookError("Missing payment currency");
    }
    if (
      checkout.expected_currency &&
      currency !== checkout.expected_currency.toUpperCase()
    ) {
      throw new PermanentWebhookError("Payment currency mismatch");
    }
    if (checkout.expected_amount !== null && totalAmount < checkout.expected_amount) {
      throw new PermanentWebhookError("Payment amount is below the expected price");
    }

    if (event.data.product_cart) {
      const item = event.data.product_cart[0];
      if (
        event.data.product_cart.length !== 1 ||
        item?.product_id !== checkout.product_id ||
        (item?.quantity ?? 1) !== 1
      ) {
        throw new PermanentWebhookError("Payment product does not match checkout");
      }
    }

    const { data: existingPayment, error: existingPaymentError } = await admin
      .from("payments")
      .select("user_id, checkout_session_id, product_id, credits")
      .eq("provider_payment_id", paymentId)
      .maybeSingle();

    if (existingPaymentError) throw existingPaymentError;
    if (
      existingPayment &&
      (existingPayment.user_id !== checkout.user_id ||
        existingPayment.checkout_session_id !== checkout.id ||
        existingPayment.product_id !== checkout.product_id ||
        existingPayment.credits !== checkout.credits)
    ) {
      throw new PermanentWebhookError("Payment is already linked to another checkout");
    }

    const { error: paymentError } = await admin.from("payments").upsert(
      {
        user_id: checkout.user_id,
        provider: "dodo",
        provider_payment_id: paymentId,
        checkout_session_id: checkout.id,
        product_id: checkout.product_id,
        credits: checkout.credits,
        amount: totalAmount,
        currency,
        status: "succeeded",
        metadata: {
          webhook_id: input.webhookId,
          provider_checkout_id: providerCheckoutId,
          expected_amount: checkout.expected_amount,
          expected_currency: checkout.expected_currency,
          payment_amount: totalAmount,
          payment_currency: currency,
          invoice_url: event.data.invoice_url ?? null,
          payment_method: event.data.payment_method ?? null,
          card_last_four: event.data.card_last_four ?? null,
        },
      },
      { onConflict: "provider_payment_id" },
    );

    if (paymentError) throw paymentError;

    const grant = await grantCredits({
      userId: checkout.user_id,
      amount: checkout.credits,
      idempotencyKey: `dodo:payment:${paymentId}`,
      referenceType: "purchase",
      referenceId: paymentId,
      metadata: { checkout_session_id: checkout.id, product_id: checkout.product_id },
    });

    const { error: checkoutError } = await admin
      .from("checkout_sessions")
      .update({ status: "completed" })
      .eq("id", checkout.id);

    if (checkoutError) throw checkoutError;

    await markEvent(input.webhookId, "processed");

    return { result: grant.idempotent ? "duplicate_grant" : "granted" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 2000) : "Webhook processing failed";
    await markEvent(input.webhookId, "failed", message);
    throw error;
  }
}
