import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { serverConfig } from "@/lib/config";
import { verifyDodoSignature } from "@/lib/services/dodo-signature";
import { PermanentWebhookError, processDodoWebhook } from "@/lib/services/dodo";

export const runtime = "nodejs";

const MAX_WEBHOOK_BYTES = 1_048_576;

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_WEBHOOK_BYTES) {
    return response({ error: "payload_too_large" }, 413);
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return response({ error: "payload_too_large" }, 413);
  }

  const headers = {
    "webhook-id": request.headers.get("webhook-id") ?? "",
    "webhook-signature": request.headers.get("webhook-signature") ?? "",
    "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
  };

  let payload: unknown;
  try {
    payload = verifyDodoSignature(rawBody, headers, serverConfig.dodo.webhookKey);
  } catch {
    // Signature failures are caller errors; never process an unverified body.
    return response({ error: "invalid_signature" }, 401);
  }

  const eventType =
    typeof payload === "object" && payload !== null && "type" in payload
      ? String((payload as { type: unknown }).type ?? "")
      : "";

  try {
    const result = await processDodoWebhook({
      webhookId: headers["webhook-id"],
      eventType,
      rawBody,
      payload,
    });
    return response({ received: true, result: result.result });
  } catch (error) {
    if (error instanceof PermanentWebhookError) {
      // Acknowledge to stop provider retries for data that can never succeed.
      console.warn(`[dodo-webhook] ignored: ${error.message}`);
      return response({ received: true, result: "ignored" });
    }
    // Transient failures return 5xx so the provider retries.
    console.error("[dodo-webhook] processing failed");
    return response({ error: "processing_failed" }, 500);
  }
}
