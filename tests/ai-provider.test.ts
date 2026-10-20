import { describe, expect, it } from "vitest";
import {
  buildAiEndpoint,
  buildGeminiRequestBody,
  buildOpenAiRequestBody,
  detectAiProvider,
  extractGeminiResult,
  extractOpenAiResult,
} from "@/lib/services/ai-provider";

describe("AI provider selection", () => {
  it("honours an explicit provider", () => {
    expect(detectAiProvider("gemini", "https://api.openai.com/v1")).toBe("gemini");
    expect(detectAiProvider("openai", "https://generativelanguage.googleapis.com/v1beta")).toBe(
      "openai",
    );
  });

  it("detects native Gemini URLs", () => {
    expect(
      detectAiProvider(undefined, "https://generativelanguage.googleapis.com/v1beta"),
    ).toBe("gemini");
    expect(
      detectAiProvider(
        undefined,
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      ),
    ).toBe("gemini");
  });

  it("treats the Gemini OpenAI-compatible path as OpenAI", () => {
    expect(
      detectAiProvider(
        undefined,
        "https://generativelanguage.googleapis.com/v1beta/openai/",
      ),
    ).toBe("openai");
  });

  it("defaults unknown providers to OpenAI-compatible", () => {
    expect(detectAiProvider(undefined, "https://api.openai.com/v1")).toBe("openai");
    expect(detectAiProvider(undefined, "https://example.test/v1")).toBe("openai");
  });
});

describe("AI endpoint construction", () => {
  it("appends /chat/completions exactly once", () => {
    expect(
      buildAiEndpoint({
        provider: "openai",
        baseUrl: "https://api.openai.com/v1/",
        model: "gpt-4.1-mini",
      }),
    ).toBe("https://api.openai.com/v1/chat/completions");

    expect(
      buildAiEndpoint({
        provider: "openai",
        baseUrl: "https://example.test/v1/chat/completions",
        model: "model",
      }),
    ).toBe("https://example.test/v1/chat/completions");
  });

  it("builds a native Gemini generateContent endpoint", () => {
    expect(
      buildAiEndpoint({
        provider: "gemini",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        model: "gemini-2.5-flash",
      }),
    ).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    );
  });

  it("keeps a configured native endpoint and strips an embedded key query", () => {
    const endpoint = buildAiEndpoint({
      provider: "gemini",
      baseUrl:
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=secret",
      model: "ignored",
    });

    expect(endpoint).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    );
    expect(endpoint).not.toContain("secret");
    expect(endpoint).not.toContain("/chat/completions");
  });

  it("rejects mixing native and OpenAI endpoint formats", () => {
    expect(() =>
      buildAiEndpoint({
        provider: "openai",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/models/x:generateContent",
        model: "x",
      }),
    ).toThrow(/native Gemini/);

    expect(() =>
      buildAiEndpoint({
        provider: "gemini",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        model: "x",
      }),
    ).toThrow(/OpenAI-compatible/);
  });
});

describe("AI request bodies", () => {
  const messages = [
    { role: "system" as const, content: "rules" },
    { role: "user" as const, content: "question" },
  ];

  it("uses the OpenAI chat completions shape", () => {
    const body = buildOpenAiRequestBody({ model: "gpt-4.1-mini", messages, maxTokens: 500 });
    expect(body).toMatchObject({
      model: "gpt-4.1-mini",
      messages,
      max_tokens: 500,
      response_format: { type: "json_object" },
    });
    expect(body).not.toHaveProperty("contents");
  });

  it("uses the native Gemini generateContent shape", () => {
    const body = buildGeminiRequestBody({ messages, maxTokens: 500 });
    expect(body).toMatchObject({
      systemInstruction: { parts: [{ text: "rules" }] },
      contents: [{ role: "user", parts: [{ text: "question" }] }],
      generationConfig: {
        maxOutputTokens: 500,
        responseMimeType: "application/json",
      },
    });
    expect(body).not.toHaveProperty("messages");
    expect(body).not.toHaveProperty("response_format");
  });
});

describe("AI response extraction", () => {
  it("joins native Gemini text parts and reads usage metadata", () => {
    const result = extractGeminiResult({
      candidates: [
        {
          content: {
            parts: [{ text: "{\"answer\":" }, { text: "\"ok\"}" }],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4 },
    });

    expect(result).toEqual({
      text: '{"answer":"ok"}',
      inputTokens: 12,
      outputTokens: 4,
      blockReason: null,
    });
  });

  it("reports a Gemini safety block", () => {
    const result = extractGeminiResult({ promptFeedback: { blockReason: "SAFETY" } });
    expect(result.text).toBeNull();
    expect(result.blockReason).toBe("SAFETY");
  });

  it("reads OpenAI-compatible choices and usage", () => {
    const result = extractOpenAiResult({
      choices: [{ message: { content: "{}" } }],
      usage: { prompt_tokens: 7, completion_tokens: 3 },
    });

    expect(result).toEqual({
      text: "{}",
      inputTokens: 7,
      outputTokens: 3,
      blockReason: null,
    });
  });
});
