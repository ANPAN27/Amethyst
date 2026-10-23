import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.hoisted(() => vi.fn());
const enforceRateLimitMock = vi.hoisted(() => vi.fn());
const createCreditCheckoutMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/auth", () => ({
  requireUser: requireUserMock,
}));

vi.mock("@/lib/api/rate-limit", () => ({
  enforceRateLimit: enforceRateLimitMock,
}));

vi.mock("@/lib/services/dodo", () => ({
  createCreditCheckout: createCreditCheckoutMock,
}));

import { POST } from "@/app/api/v1/credits/checkout/route";
import { ApiError } from "@/lib/api/errors";

const user = { id: "11111111-1111-4111-8111-111111111111", email: "buyer@example.com" };

function request(body: unknown) {
  return new NextRequest("http://localhost/api/v1/credits/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  enforceRateLimitMock.mockResolvedValue(undefined);
  createCreditCheckoutMock.mockResolvedValue({
    checkout_url: "https://checkout.example/cs_123",
    provider_session_id: "cs_123",
    product_id: "pdt_100",
    credits: 100,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/v1/credits/checkout", () => {
  it("rejects unauthenticated callers before creating a checkout", async () => {
    requireUserMock.mockRejectedValue(
      new ApiError(401, "unauthorized", "Authentication required"),
    );

    const response = await POST(request({ product_id: "pdt_100" }));

    expect(response.status).toBe(401);
    expect(enforceRateLimitMock).not.toHaveBeenCalled();
    expect(createCreditCheckoutMock).not.toHaveBeenCalled();
  });

  it("rejects invalid bodies without creating a checkout", async () => {
    requireUserMock.mockResolvedValue(user);

    const response = await POST(request({ product_id: "" }));

    expect(response.status).toBe(400);
    expect(enforceRateLimitMock).toHaveBeenCalledWith(
      user.id,
      "credits:checkout",
      10,
      3600,
    );
    expect(createCreditCheckoutMock).not.toHaveBeenCalled();
  });

  it("creates a checkout for an authenticated caller", async () => {
    requireUserMock.mockResolvedValue(user);

    const response = await POST(request({ product_id: "pdt_100" }));
    const body = (await response.json()) as {
      data: { checkout: { checkout_url: string; credits: number } };
    };

    expect(response.status).toBe(201);
    expect(createCreditCheckoutMock).toHaveBeenCalledWith(user, "pdt_100");
    expect(body.data.checkout).toMatchObject({
      checkout_url: "https://checkout.example/cs_123",
      credits: 100,
    });
  });
});
