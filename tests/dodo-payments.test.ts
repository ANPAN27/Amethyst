import { randomUUID } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dodoMock = vi.hoisted(() => ({
  checkoutSessions: { create: vi.fn() },
  products: { retrieve: vi.fn() },
}));
const grantCreditsMock = vi.hoisted(() => vi.fn());
const getSupabaseAdminMock = vi.hoisted(() => vi.fn());

vi.mock("dodopayments", () => ({
  default: class {
    checkoutSessions = dodoMock.checkoutSessions;
    products = dodoMock.products;
  },
}));

vi.mock("@/lib/services/credits", () => ({
  grantCredits: grantCreditsMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: getSupabaseAdminMock,
}));

vi.mock("@/lib/config", () => ({
  serverConfig: {
    dodo: {
      apiKey: "test_api_key",
      webhookKey: "whsec_test",
      environment: "test_mode",
    },
  },
  publicConfig: { appUrl: "http://localhost:3000" },
  getCreditProduct: vi.fn(),
  dodoConfigured: vi.fn(),
}));

import { dodoConfigured, getCreditProduct } from "@/lib/config";
import {
  createCreditCheckout,
  PermanentWebhookError,
  processDodoWebhook,
} from "@/lib/services/dodo";
import { checkoutSchema } from "@/lib/validation/schemas";

type Row = Record<string, unknown>;
type FakeDb = Record<string, Row[]>;
type FakeResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

class FakeQuery implements PromiseLike<FakeResult> {
  private action: "select" | "insert" | "update" | "upsert" = "select";
  private payload: Row | null = null;
  private conflict = "id";
  private filters: Array<[string, unknown]> = [];

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
  ) {}

  insert(row: Row) {
    this.action = "insert";
    this.payload = row;
    return this;
  }

  upsert(row: Row, options?: { onConflict?: string }) {
    this.action = "upsert";
    this.payload = row;
    this.conflict = options?.onConflict ?? "id";
    return this;
  }

  update(row: Row) {
    this.action = "update";
    this.payload = row;
    return this;
  }

  select(columns?: string) {
    void columns;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  maybeSingle() {
    return this.execute("maybeSingle");
  }

  single() {
    return this.execute("single");
  }

  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?: ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute("many").then(onfulfilled, onrejected);
  }

  private rows(): Row[] {
    return (this.db[this.table] ??= []);
  }

  private async execute(mode: "many" | "maybeSingle" | "single"): Promise<FakeResult> {
    const rows = this.rows();

    if (this.action === "insert") {
      const row = this.payload;
      if (!row) return { data: null, error: { message: "missing insert payload" } };
      if (this.table === "webhook_events" && rows.some((existing) => existing.id === row.id)) {
        return { data: null, error: { code: "23505", message: "duplicate key" } };
      }
      const stored = { ...row };
      if (this.table === "checkout_sessions" && !stored.id) stored.id = randomUUID();
      rows.push(stored);
      return { data: mode === "many" ? null : { ...stored }, error: null };
    }

    if (this.action === "upsert") {
      const row = this.payload;
      if (!row) return { data: null, error: { message: "missing upsert payload" } };
      const index = rows.findIndex((existing) => existing[this.conflict] === row[this.conflict]);
      if (index >= 0) rows[index] = { ...rows[index], ...row };
      else rows.push({ ...row });
      return { data: null, error: null };
    }

    const matches = rows.filter((row) =>
      this.filters.every(([column, value]) => row[column] === value),
    );

    if (this.action === "update") {
      for (const row of matches) Object.assign(row, this.payload);
      return { data: null, error: null };
    }

    if (mode === "many") return { data: matches.map((row) => ({ ...row })), error: null };
    if (mode === "single" && matches.length !== 1) {
      return { data: null, error: { message: "single row expected" } };
    }
    return { data: matches[0] ? { ...matches[0] } : null, error: null };
  }
}

function installDb(initial: Partial<FakeDb> = {}): FakeDb {
  const db: FakeDb = {
    checkout_sessions: [],
    webhook_events: [],
    payments: [],
    ...initial,
  };
  getSupabaseAdminMock.mockReturnValue({
    from: (table: string) => new FakeQuery(db, table),
  });
  return db;
}

const userId = "11111111-1111-4111-8111-111111111111";
const checkoutId = "22222222-2222-4222-8222-222222222222";
const user = { id: userId, email: "buyer@example.com" } as User;
const metadata = {
  user_id: userId,
  checkout_session_id: checkoutId,
  product_id: "pdt_100",
  credits: "100",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCreditProduct).mockImplementation((productId) =>
    productId === "pdt_100" ? { credits: 100 } : null,
  );
  vi.mocked(dodoConfigured).mockReturnValue(true);
  grantCreditsMock.mockResolvedValue({
    transactionId: "txn_1",
    balanceAfter: 100,
    idempotent: false,
  });
  dodoMock.products.retrieve.mockResolvedValue({
    product_id: "pdt_100",
    price: { type: "one_time_price", price: 500, currency: "USD" },
  });
  dodoMock.checkoutSessions.create.mockResolvedValue({
    session_id: "cs_123",
    checkout_url: "https://checkout.example/cs_123",
  });
});

function checkoutRow(overrides: Partial<Row> = {}): Row {
  return {
    id: checkoutId,
    user_id: userId,
    product_id: "pdt_100",
    credits: 100,
    provider_session_id: "cs_123",
    expected_amount: 500,
    expected_currency: "USD",
    status: "created",
    ...overrides,
  };
}

function paymentPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    type: "payment.succeeded",
    data: {
      payment_id: "pay_123",
      status: "succeeded",
      total_amount: 500,
      currency: "USD",
      checkout_session_id: "cs_123",
      invoice_url: "https://example.com/invoice.pdf",
      payment_method: "card",
      card_last_four: "4242",
      metadata,
      product_cart: [{ product_id: "pdt_100", quantity: 1 }],
      ...overrides,
    },
  };
}

function setupWebhook(
  options: { checkout?: Partial<Row>; events?: Row[]; payments?: Row[] } = {},
) {
  const db = installDb({
    checkout_sessions: [checkoutRow(options.checkout)],
    webhook_events: options.events ?? [],
    payments: options.payments ?? [],
  });
  return { db, payload: paymentPayload() };
}

function processWebhook(payload: unknown, webhookId = "wh_1") {
  const type =
    typeof payload === "object" && payload !== null && "type" in payload
      ? String((payload as { type: unknown }).type)
      : "";
  return processDodoWebhook({
    webhookId,
    eventType: type,
    rawBody: JSON.stringify(payload),
    payload,
  });
}

describe("createCreditCheckout", () => {
  it("ignores client-supplied credit, amount and user fields", () => {
    expect(
      checkoutSchema.parse({
        product_id: "pdt_100",
        credits: 999999,
        amount: 1,
        user_id: "99999999-9999-4999-8999-999999999999",
      }),
    ).toEqual({ product_id: "pdt_100" });
  });

  it("creates a checkout from server-side product data", async () => {
    const db = installDb({ checkout_sessions: [] });

    const result = await createCreditCheckout(user, "pdt_100");

    expect(result).toEqual({
      checkout_url: "https://checkout.example/cs_123",
      provider_session_id: "cs_123",
      product_id: "pdt_100",
      credits: 100,
    });
    expect(dodoMock.products.retrieve).toHaveBeenCalledWith("pdt_100");
    expect(dodoMock.checkoutSessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        product_cart: [{ product_id: "pdt_100", quantity: 1 }],
        billing_currency: "USD",
        metadata: expect.objectContaining({
          user_id: userId,
          product_id: "pdt_100",
          credits: "100",
          checkout_session_id: expect.any(String),
        }),
      }),
      { idempotencyKey: expect.stringMatching(/^credit-checkout:/) },
    );
    expect(db.checkout_sessions?.[0]).toMatchObject({
      expected_amount: 500,
      expected_currency: "USD",
      provider_session_id: "cs_123",
      status: "created",
    });
  });

  it("rejects unknown products before calling Dodo", async () => {
    installDb();

    await expect(createCreditCheckout(user, "pdt_unknown")).rejects.toMatchObject({
      status: 400,
    });
    expect(dodoMock.products.retrieve).not.toHaveBeenCalled();
  });

  it("rejects checkout when payments are not configured", async () => {
    vi.mocked(dodoConfigured).mockReturnValue(false);
    installDb();

    await expect(createCreditCheckout(user, "pdt_100")).rejects.toMatchObject({
      status: 503,
    });
    expect(dodoMock.products.retrieve).not.toHaveBeenCalled();
  });

  it("rejects recurring products", async () => {
    const db = installDb();
    dodoMock.products.retrieve.mockResolvedValue({
      price: { type: "recurring_price", price: 500, currency: "USD" },
    });

    await expect(createCreditCheckout(user, "pdt_100")).rejects.toMatchObject({
      status: 400,
    });
    expect(db.checkout_sessions).toHaveLength(0);
  });

  it("rejects non-positive prices", async () => {
    const db = installDb();
    dodoMock.products.retrieve.mockResolvedValue({
      price: { type: "one_time_price", price: 0, currency: "USD" },
    });

    await expect(createCreditCheckout(user, "pdt_100")).rejects.toMatchObject({
      status: 400,
    });
    expect(db.checkout_sessions).toHaveLength(0);
  });

  it("marks the checkout failed when Dodo omits the checkout URL", async () => {
    const db = installDb();
    dodoMock.checkoutSessions.create.mockResolvedValue({
      session_id: "cs_123",
      checkout_url: null,
    });

    await expect(createCreditCheckout(user, "pdt_100")).rejects.toMatchObject({
      status: 503,
    });
    expect(db.checkout_sessions?.[0]?.status).toBe("failed");
  });

  it("marks the checkout failed when Dodo rejects session creation", async () => {
    const db = installDb();
    dodoMock.checkoutSessions.create.mockRejectedValue(new Error("network"));

    await expect(createCreditCheckout(user, "pdt_100")).rejects.toMatchObject({
      status: 503,
    });
    expect(db.checkout_sessions?.[0]?.status).toBe("failed");
  });
});

describe("processDodoWebhook", () => {
  it("grants credits once for a verified successful payment", async () => {
    const { db, payload } = setupWebhook();

    const result = await processWebhook(payload);

    expect(result.result).toBe("granted");
    expect(grantCreditsMock).toHaveBeenCalledWith({
      userId,
      amount: 100,
      idempotencyKey: "dodo:payment:pay_123",
      referenceType: "purchase",
      referenceId: "pay_123",
      metadata: { checkout_session_id: checkoutId, product_id: "pdt_100" },
    });
    expect(db.payments?.[0]).toMatchObject({
      user_id: userId,
      provider_payment_id: "pay_123",
      checkout_session_id: checkoutId,
      product_id: "pdt_100",
      credits: 100,
      amount: 500,
      currency: "USD",
      status: "succeeded",
      metadata: expect.objectContaining({
        invoice_url: "https://example.com/invoice.pdf",
        payment_method: "card",
        card_last_four: "4242",
      }),
    });
    expect(db.checkout_sessions?.[0]?.status).toBe("completed");
    expect(db.webhook_events?.[0]).toMatchObject({ status: "processed", attempts: 1 });
  });

  it("acknowledges an already processed webhook without granting again", async () => {
    const { db, payload } = setupWebhook({
      events: [{ id: "wh_1", status: "processed", attempts: 1 }],
    });

    const result = await processWebhook(payload);

    expect(result.result).toBe("duplicate");
    expect(grantCreditsMock).not.toHaveBeenCalled();
    expect(db.checkout_sessions?.[0]?.status).toBe("created");
  });

  it("does not double-grant a duplicate payment under a new webhook id", async () => {
    grantCreditsMock.mockResolvedValue({
      transactionId: "txn_1",
      balanceAfter: 100,
      idempotent: true,
    });
    const { payload } = setupWebhook({
      payments: [
        {
          provider_payment_id: "pay_123",
          user_id: userId,
          checkout_session_id: checkoutId,
          product_id: "pdt_100",
          credits: 100,
          status: "succeeded",
        },
      ],
    });

    const result = await processWebhook(payload);

    expect(result.result).toBe("duplicate_grant");
    expect(grantCreditsMock).toHaveBeenCalledTimes(1);
  });

  it("ignores non-succeeded events", async () => {
    const payload = paymentPayload({ status: "failed" });
    payload.type = "payment.failed";
    const { db } = setupWebhook();

    const result = await processWebhook(payload);

    expect(result.result).toBe("ignored");
    expect(grantCreditsMock).not.toHaveBeenCalled();
    expect(db.webhook_events?.[0]?.status).toBe("processed");
  });

  it("rejects a checkout whose owner does not match webhook metadata", async () => {
    const payload = paymentPayload({
      metadata: { ...metadata, user_id: "99999999-9999-4999-8999-999999999999" },
    });
    const { db } = setupWebhook();

    await expect(processWebhook(payload)).rejects.toBeInstanceOf(PermanentWebhookError);
    expect(grantCreditsMock).not.toHaveBeenCalled();
    expect(db.webhook_events?.[0]?.status).toBe("failed");
  });

  it("rejects a product whose server-side credit mapping changed", async () => {
    vi.mocked(getCreditProduct).mockReturnValue({ credits: 50 });
    const { payload } = setupWebhook();

    await expect(processWebhook(payload)).rejects.toBeInstanceOf(PermanentWebhookError);
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("rejects a currency mismatch", async () => {
    const payload = paymentPayload({ currency: "EUR" });
    setupWebhook();

    await expect(processWebhook(payload)).rejects.toBeInstanceOf(PermanentWebhookError);
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("rejects a payment for a different product", async () => {
    const payload = paymentPayload({
      product_cart: [{ product_id: "pdt_other", quantity: 1 }],
    });
    setupWebhook();

    await expect(processWebhook(payload)).rejects.toBeInstanceOf(PermanentWebhookError);
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("rejects an amount below the expected product price", async () => {
    const payload = paymentPayload({ total_amount: 499 });
    setupWebhook();

    await expect(processWebhook(payload)).rejects.toBeInstanceOf(PermanentWebhookError);
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("rejects a provider checkout id that differs from the stored session", async () => {
    const payload = paymentPayload({ checkout_session_id: "cs_other" });
    setupWebhook();

    await expect(processWebhook(payload)).rejects.toBeInstanceOf(PermanentWebhookError);
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("rejects a second successful payment for the same checkout", async () => {
    setupWebhook({
      payments: [
        {
          provider_payment_id: "pay_other",
          user_id: userId,
          checkout_session_id: checkoutId,
          product_id: "pdt_100",
          credits: 100,
          status: "succeeded",
        },
      ],
    });

    await expect(processWebhook(paymentPayload())).rejects.toBeInstanceOf(
      PermanentWebhookError,
    );
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("rejects a payment already linked to another checkout", async () => {
    setupWebhook({
      payments: [
        {
          provider_payment_id: "pay_123",
          user_id: userId,
          checkout_session_id: "other-checkout",
          product_id: "pdt_100",
          credits: 100,
        },
      ],
    });

    await expect(processWebhook(paymentPayload())).rejects.toBeInstanceOf(
      PermanentWebhookError,
    );
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("rejects payments without a matching checkout", async () => {
    installDb();

    await expect(processWebhook(paymentPayload())).rejects.toBeInstanceOf(
      PermanentWebhookError,
    );
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("rejects an unrecognized payload", async () => {
    installDb();

    await expect(
      processWebhook({ type: "payment.succeeded", data: {} }),
    ).rejects.toBeInstanceOf(PermanentWebhookError);
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("retries transient grant failures without double-crediting", async () => {
    const { db, payload } = setupWebhook();
    grantCreditsMock.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(processWebhook(payload)).rejects.toThrow("database unavailable");
    expect(db.webhook_events?.[0]?.status).toBe("failed");
    expect(db.checkout_sessions?.[0]?.status).toBe("created");

    grantCreditsMock.mockResolvedValueOnce({
      transactionId: "txn_1",
      balanceAfter: 100,
      idempotent: false,
    });
    const retry = await processWebhook(payload);

    expect(retry.result).toBe("granted");
    expect(grantCreditsMock).toHaveBeenCalledTimes(2);
    expect(db.webhook_events?.[0]?.status).toBe("processed");
    expect(db.checkout_sessions?.[0]?.status).toBe("completed");
  });
});
