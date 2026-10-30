import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  dodoConfigured,
  getCreditProduct,
  getCreditProducts,
  paymentConfigurationIssues,
  serverConfig,
} from "@/lib/config";

const KEYS = [
  "DODO_PAYMENTS_API_KEY",
  "DODO_PAYMENTS_WEBHOOK_KEY",
  "DODO_ENVIRONMENT",
  "DODO_PRODUCT_CREDITS",
] as const;
const original = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of KEYS) {
    original.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    const value = original.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Dodo configuration", () => {
  it("defaults to test mode", () => {
    expect(serverConfig.dodo.environment).toBe("test_mode");
  });

  it("rejects an invalid environment", () => {
    process.env.DODO_ENVIRONMENT = "production";
    expect(() => serverConfig.dodo.environment).toThrow(/DODO_ENVIRONMENT/);
  });

  it("parses server-controlled product credits", () => {
    process.env.DODO_PRODUCT_CREDITS = JSON.stringify({
      pdt_100: { credits: 100 },
      pdt_500: { credits: 500 },
    });

    expect(getCreditProducts()).toEqual({
      pdt_100: { credits: 100 },
      pdt_500: { credits: 500 },
    });
    expect(getCreditProduct("pdt_500")).toEqual({ credits: 500 });
    expect(getCreditProduct("pdt_unknown")).toBeNull();
  });

  it("rejects malformed product mappings", () => {
    process.env.DODO_PRODUCT_CREDITS = "not-json";
    expect(() => getCreditProducts()).toThrow(/valid JSON/);

    process.env.DODO_PRODUCT_CREDITS = JSON.stringify({ pdt_bad: { credits: 0 } });
    expect(() => getCreditProducts()).toThrow();
  });

  it("requires both secrets and at least one product", () => {
    process.env.DODO_PRODUCT_CREDITS = JSON.stringify({ pdt_100: { credits: 100 } });
    expect(dodoConfigured()).toBe(false);

    process.env.DODO_PAYMENTS_API_KEY = "test_api_key";
    process.env.DODO_PAYMENTS_WEBHOOK_KEY = "whsec_test";
    expect(dodoConfigured()).toBe(true);
  });

  it("reports missing payment configuration names without values", () => {
    expect(paymentConfigurationIssues()).toEqual([
      "DODO_PAYMENTS_API_KEY",
      "DODO_PAYMENTS_WEBHOOK_KEY",
      "DODO_PRODUCT_CREDITS",
    ]);

    process.env.DODO_PAYMENTS_API_KEY = "test_api_key";
    process.env.DODO_PAYMENTS_WEBHOOK_KEY = "whsec_test";
    process.env.DODO_PRODUCT_CREDITS = JSON.stringify({ pdt_100: { credits: 100 } });
    expect(paymentConfigurationIssues()).toEqual([]);
  });

  it("reports invalid product mapping configuration", () => {
    process.env.DODO_PAYMENTS_API_KEY = "test_api_key";
    process.env.DODO_PAYMENTS_WEBHOOK_KEY = "whsec_test";
    process.env.DODO_PRODUCT_CREDITS = "not-json";

    expect(paymentConfigurationIssues()).toEqual(["DODO_PRODUCT_CREDITS (invalid JSON)"]);
  });
});
