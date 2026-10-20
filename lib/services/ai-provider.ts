export type AiProvider = "openai" | "gemini";

export type ChatMessage = {
  role: "system" | "user";
  content: string;
};

export function detectAiProvider(explicit: string | undefined, baseUrl: string): AiProvider {
  if (explicit === "openai" || explicit === "gemini") return explicit;

  const normalized = baseUrl.toLowerCase();
  if (normalized.includes("/openai")) return "openai";
  if (
    normalized.includes("generativelanguage.googleapis.com") ||
    normalized.includes(":generatecontent")
  ) {
    return "gemini";
  }
  return "openai";
}

/**
 * Builds exactly one provider endpoint. Native Gemini never gets a
 * `/chat/completions` suffix, and the OpenAI-compatible endpoint never gets a
 * `:generateContent` suffix.
 */
export function buildAiEndpoint(input: {
  provider: AiProvider;
  baseUrl: string;
  model: string;
}): string {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("AI_BASE_URL must not be empty");

  if (input.provider === "openai") {
    if (baseUrl.toLowerCase().includes(":generatecontent")) {
      throw new Error(
        "AI_BASE_URL is a native Gemini generateContent URL; set AI_PROVIDER=gemini or use the OpenAI-compatible base URL",
      );
    }
    if (baseUrl.toLowerCase().endsWith("/chat/completions")) return baseUrl;
    return `${baseUrl}/chat/completions`;
  }

  return buildGeminiEndpoint(baseUrl, input.model);
}

function buildGeminiEndpoint(baseUrl: string, model: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("AI_BASE_URL must be a valid URL");
  }

  if (url.pathname.includes("/openai")) {
    throw new Error(
      "AI_BASE_URL points at the OpenAI-compatible endpoint; set AI_PROVIDER=openai or use a native Gemini base URL",
    );
  }

  if (/:generateContent$/i.test(url.pathname)) {
    url.search = "";
    return url.toString();
  }

  let path = url.pathname.replace(/\/+$/, "");
  if (!path || path === "/") path = "/v1beta";
  const modelsPath = path.endsWith("/models") ? path : `${path}/models`;

  url.pathname = `${modelsPath}/${encodeURIComponent(model)}:generateContent`;
  url.search = "";
  return url.toString();
}

export function buildOpenAiRequestBody(input: {
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
}): Record<string, unknown> {
  return {
    model: input.model,
    messages: input.messages,
    temperature: 0.2,
    max_tokens: input.maxTokens,
    response_format: { type: "json_object" },
  };
}

export function buildGeminiRequestBody(input: {
  messages: ChatMessage[];
  maxTokens: number;
}): Record<string, unknown> {
  const system = input.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const contents = input.messages
    .filter((message) => message.role === "user")
    .map((message) => ({
      role: "user",
      parts: [{ text: message.content }],
    }));

  return {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: input.maxTokens,
      responseMimeType: "application/json",
    },
  };
}

type ExtractedModelResult = {
  text: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  blockReason: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export function extractOpenAiResult(payload: unknown): ExtractedModelResult {
  if (!isRecord(payload)) {
    return { text: null, inputTokens: null, outputTokens: null, blockReason: null };
  }

  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0];
  const message = isRecord(first) && isRecord(first.message) ? first.message : null;
  const text = message && typeof message.content === "string" ? message.content : null;
  const usage = isRecord(payload.usage) ? payload.usage : null;

  return {
    text,
    inputTokens: usage ? tokenCount(usage.prompt_tokens) : null,
    outputTokens: usage ? tokenCount(usage.completion_tokens) : null,
    blockReason: null,
  };
}

export function extractGeminiResult(payload: unknown): ExtractedModelResult {
  if (!isRecord(payload)) {
    return { text: null, inputTokens: null, outputTokens: null, blockReason: null };
  }

  const feedback = isRecord(payload.promptFeedback) ? payload.promptFeedback : null;
  const blockReason =
    feedback && typeof feedback.blockReason === "string" ? feedback.blockReason : null;

  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const first = candidates[0];
  const content =
    isRecord(first) && isRecord(first.content) ? first.content : isRecord(first) ? first : null;
  const parts = content && Array.isArray(content.parts) ? content.parts : [];

  const text = parts
    .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
    .join("");

  const usage = isRecord(payload.usageMetadata) ? payload.usageMetadata : null;

  const finishReason =
    isRecord(first) && typeof first.finishReason === "string" ? first.finishReason : null;

  return {
    text: text.length > 0 ? text : null,
    inputTokens: usage ? tokenCount(usage.promptTokenCount) : null,
    outputTokens: usage ? tokenCount(usage.candidatesTokenCount) : null,
    blockReason: blockReason ?? (finishReason === "SAFETY" ? "SAFETY" : null),
  };
}
