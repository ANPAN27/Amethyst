import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dodoMock = vi.hoisted(() => {
  class PermanentWebhookError extends Error {}
  return {
    processDodoWebhook: vi.fn(),
    PermanentWebhookError,
  };
});
const verifyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/services/dodo", () => dodoMock);
vi.mock("@/lib/services/dodo-signature", () => ({
  verifyDodoSignature: verifyMock,
}));
vi.mock("@/lib/config", () => ({
  serverConfig: { dodo: { webhookKey: "whsec_test" } },
}));

import { POST } from "@/app/api/v1/webhooks/dodo/route";

const payload = JSON.stringify({
  type: "payment.succeeded",
  data: { payment_id: "pay_123" },
});

function request(body = payload) {
  return new NextRequest("http://localhost/api/v1/webhooks/dodo", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": "wh_1",
      "webhook-signature": "sig",
      "webhook-timestamp": "123",
    },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/v1/webhooks/dodo", () => {
  it("rejects invalid signatures before processing", async () => {
    verifyMock.mockImplementation(() => {
      throw new Error("invalid");
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(dodoMock.processDodoWebhook).not.toHaveBeenCalled();
  });

  it("processes a verified payload", async () => {
    verifyMock.mockReturnValue({ type: "payment.succeeded" });
    dodoMock.processDodoWebhook.mockResolvedValue({ result: "granted" });

    const response = await POST(request());
    const body = (await response.json()) as { received: boolean; result: string };

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true, result: "granted" });
    expect(dodoMock.processDodoWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookId: "wh_1",
        eventType: "payment.succeeded",
        rawBody: payload,
      }),
    );
  });

  it("acknowledges permanent processing errors", async () => {
    verifyMock.mockReturnValue({ type: "payment.succeeded" });
    dodoMock.processDodoWebhook.mockRejectedValue(
      new dodoMock.PermanentWebhookError("bad data"),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, result: "ignored" });
  });

  it("returns 500 for transient processing errors", async () => {
    verifyMock.mockReturnValue({ type: "payment.succeeded" });
    dodoMock.processDodoWebhook.mockRejectedValue(new Error("database unavailable"));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "processing_failed" });
  });
});
