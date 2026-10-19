import { randomBytes } from "node:crypto";
import { Webhook } from "standardwebhooks";
import { describe, expect, it } from "vitest";
import { verifyDodoSignature } from "@/lib/services/dodo-signature";

function makeSecret(): string {
  return `whsec_${randomBytes(32).toString("base64")}`;
}

function sign(secret: string, payload: string, date = new Date()) {
  const id = `msg_${randomBytes(8).toString("hex")}`;
  const timestamp = Math.floor(date.getTime() / 1000).toString();
  const signature = new Webhook(secret).sign(id, date, payload);
  return {
    headers: {
      "webhook-id": id,
      "webhook-signature": signature,
      "webhook-timestamp": timestamp,
    },
  };
}

describe("verifyDodoSignature", () => {
  it("accepts a valid Standard Webhooks signature and returns parsed JSON", () => {
    const secret = makeSecret();
    const payload = JSON.stringify({ type: "payment.succeeded", data: { payment_id: "pay_1" } });
    const { headers } = sign(secret, payload);

    const value = verifyDodoSignature(payload, headers, secret) as {
      type: string;
      data: { payment_id: string };
    };

    expect(value.type).toBe("payment.succeeded");
    expect(value.data.payment_id).toBe("pay_1");
  });

  it("rejects a tampered body", () => {
    const secret = makeSecret();
    const payload = JSON.stringify({ type: "payment.succeeded" });
    const { headers } = sign(secret, payload);

    expect(() =>
      verifyDodoSignature(JSON.stringify({ type: "payment.failed" }), headers, secret),
    ).toThrow();
  });

  it("rejects a signature from a different secret", () => {
    const payload = JSON.stringify({ type: "payment.succeeded" });
    const { headers } = sign(makeSecret(), payload);

    expect(() => verifyDodoSignature(payload, headers, makeSecret())).toThrow();
  });

  it("rejects stale timestamps", () => {
    const secret = makeSecret();
    const payload = JSON.stringify({ type: "payment.succeeded" });
    const stale = new Date(Date.now() - 10 * 60 * 1000);
    const { headers } = sign(secret, payload, stale);

    expect(() => verifyDodoSignature(payload, headers, secret)).toThrow(/too old/);
  });

  it("rejects missing headers before touching the payload", () => {
    const secret = makeSecret();
    expect(() =>
      verifyDodoSignature(
        "{}",
        { "webhook-id": "", "webhook-signature": "", "webhook-timestamp": "" },
        secret,
      ),
    ).toThrow(/missing_webhook_headers/);
  });
});
