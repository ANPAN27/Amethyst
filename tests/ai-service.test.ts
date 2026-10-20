import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answerWithEvidence, generateCode } from "@/lib/services/ai";

const KEYS = [
  "AI_API_KEY",
  "AI_PROVIDER",
  "AI_BASE_URL",
  "AI_MODEL",
  "AI_REQUEST_TIMEOUT_MS",
  "AI_MAX_EVIDENCE_CHARS",
] as const;

const original = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of KEYS) {
    original.set(key, process.env[key]);
    delete process.env[key];
  }
  process.env.AI_API_KEY = "test-key";
  process.env.AI_REQUEST_TIMEOUT_MS = "5000";
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of KEYS) {
    const value = original.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function mockFetch(payload: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const evidence = [
  {
    id: "ev1",
    class: "observed",
    category: "module",
    title: "Entry module",
    detail: "index.js imports util.js",
    evidence: [],
  },
];

describe("AI service with native Gemini", () => {
  it("posts the native generateContent shape and filters citations", async () => {
    process.env.AI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
    process.env.AI_MODEL = "gemini-2.5-flash";
    process.env.AI_PROVIDER = "gemini";

    const fetchMock = mockFetch({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  answer: "The entry module imports util.",
                  grounding: "evidence",
                  cited_evidence_ids: ["ev1", "ev2"],
                  assumptions: [],
                }),
              },
            ],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 21, candidatesTokenCount: 9 },
    });

    const result = await answerWithEvidence({ question: "What imports what?", evidence });

    expect(result.answer).toBe("The entry module imports util.");
    expect(result.citedEvidenceIds).toEqual(["ev1"]);
    expect(result.inputTokens).toBe(21);
    expect(result.outputTokens).toBe(9);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    );

    const headers = init?.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("test-key");
    expect(headers.Authorization).toBeUndefined();

    const body = JSON.parse(String(init?.body)) as {
      contents?: Array<{ parts: Array<{ text?: string }> }>;
      generationConfig?: { responseMimeType?: string };
      messages?: unknown;
      response_format?: unknown;
      systemInstruction?: { parts: Array<{ text?: string }> };
    };
    expect(body).not.toHaveProperty("messages");
    expect(body).not.toHaveProperty("response_format");
    expect(body.generationConfig?.responseMimeType).toBe("application/json");
    expect(body.contents?.[0]?.parts[0]?.text).toContain("<question>");
    expect(body.systemInstruction?.parts[0]?.text).toContain("Evidence blocks");
  });

  it("returns a labeled fallback for non-JSON chat text", async () => {
    process.env.AI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
    process.env.AI_MODEL = "gemini-2.5-flash";
    process.env.AI_PROVIDER = "gemini";
    mockFetch({ candidates: [{ content: { parts: [{ text: "not json" }] } }] });

    const result = await answerWithEvidence({ question: "Q", evidence: [] });
    expect(result.answer).toBe("not json");
    expect(result.grounding).toBe("insufficient");
    expect(result.citedEvidenceIds).toEqual([]);
  });

  it("rejects mixed native and OpenAI configuration", async () => {
    process.env.AI_BASE_URL =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
    process.env.AI_PROVIDER = "openai";
    const fetchMock = mockFetch({});

    await expect(answerWithEvidence({ question: "Q", evidence })).rejects.toThrow(/native Gemini/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("AI service with an OpenAI-compatible provider", () => {
  it("posts chat completions and returns validated code", async () => {
    process.env.AI_BASE_URL = "https://api.openai.com/v1";
    process.env.AI_MODEL = "gpt-4.1-mini";
    delete process.env.AI_PROVIDER;

    const fetchMock = mockFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: "Adds a guard.",
              code: "export const ok = true;",
              language: "typescript",
              grounding: "evidence",
              cited_evidence_ids: ["ev1"],
              assumptions: [],
              limitations: ["Review before applying."],
            }),
          },
        },
      ],
      usage: { prompt_tokens: 11, completion_tokens: 7 },
    });

    const result = await generateCode({
      instructions: "Add a guard",
      language: "typescript",
      evidence,
    });

    expect(result.code).toBe("export const ok = true;");
    expect(result.citedEvidenceIds).toEqual(["ev1"]);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.openai.com/v1/chat/completions");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key");

    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages).toBeInstanceOf(Array);
    expect(body).not.toHaveProperty("contents");
  });

  it("fails closed when codegen returns invalid structured output", async () => {
    process.env.AI_BASE_URL = "https://api.openai.com/v1";
    mockFetch({ choices: [{ message: { content: "not json" } }] });

    await expect(
      generateCode({ instructions: "Add a guard", evidence }),
    ).rejects.toMatchObject({ status: 503 });
  });
});
