import { Webhook } from "standardwebhooks";

export type WebhookHeaders = {
  "webhook-id": string;
  "webhook-signature": string;
  "webhook-timestamp": string;
};

/**
 * Verifies a Dodo Payments (Standard Webhooks) signature against the exact raw
 * request body. Throws when the signature is missing, malformed, stale or
 * invalid.
 */
export function verifyDodoSignature(
  rawBody: string,
  headers: WebhookHeaders,
  secret: string,
): unknown {
  if (!headers["webhook-id"] || !headers["webhook-signature"] || !headers["webhook-timestamp"]) {
    throw new Error("missing_webhook_headers");
  }
  if (!secret) throw new Error("missing_webhook_secret");

  const webhook = new Webhook(secret);
  return webhook.verify(rawBody, headers);
}
