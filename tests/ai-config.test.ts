import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { serverConfig } from "@/lib/config";

const KEYS = ["AI_PROVIDER", "AI_BASE_URL", "AI_MODEL"] as const;
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

describe("AI configuration", () => {
  it("defaults to an OpenAI-compatible provider", () => {
    process.env.AI_BASE_URL = "https://api.openai.com/v1";
    expect(serverConfig.ai.provider).toBe("openai");
    expect(serverConfig.ai.model).toBe("gpt-4.1-mini");
  });

  it("requires an explicit model for a native Gemini base URL", () => {
    process.env.AI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
    expect(serverConfig.ai.provider).toBe("gemini");
    expect(() => serverConfig.ai.model).toThrow(/AI_MODEL/);
  });

  it("derives the model from a full native Gemini URL", () => {
    process.env.AI_BASE_URL =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
    expect(serverConfig.ai.model).toBe("gemini-2.5-flash");
  });

  it("uses an explicit Gemini model", () => {
    process.env.AI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
    process.env.AI_MODEL = "gemini-2.5-pro";
    expect(serverConfig.ai.model).toBe("gemini-2.5-pro");
  });

  it("allows an explicit provider override", () => {
    process.env.AI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
    process.env.AI_PROVIDER = "openai";
    expect(serverConfig.ai.provider).toBe("openai");
  });

  it("rejects an invalid provider", () => {
    process.env.AI_PROVIDER = "anthropic";
    expect(() => serverConfig.ai.provider).toThrow(/AI_PROVIDER/);
  });
});
