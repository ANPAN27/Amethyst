import type { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";

const MAX_JSON_BYTES = 1_048_576;

export async function parseJson<T extends z.ZodTypeAny>(
  request: NextRequest,
  schema: T,
  maxBytes = MAX_JSON_BYTES,
): Promise<z.infer<T>> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > maxBytes) {
    throw new ApiError(413, "invalid_request", "Request body is too large");
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ApiError(415, "invalid_request", "Content-Type must be application/json");
  }

  let raw: string;
  try {
    raw = await readLimitedText(request, maxBytes);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "invalid_request", "Unable to read request body");
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "invalid_request", "Malformed JSON body");
  }

  return schema.parse(body);
}

async function readLimitedText(request: NextRequest, maxBytes: number): Promise<string> {
  const stream = request.body;
  if (!stream) return "";

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ApiError(413, "invalid_request", "Request body is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8", { fatal: true }).decode(merged);
}

export function parseUuid(value: string, field = "id"): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) {
    throw new ApiError(400, "invalid_request", `Invalid ${field}`);
  }
  return parsed.data;
}

function integerParam(raw: string | null, field: string, min: number, max: number): number | null {
  if (raw === null) return null;
  if (!/^\d+$/.test(raw)) {
    throw new ApiError(400, "invalid_request", `${field} must be an integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ApiError(400, "invalid_request", `${field} must be between ${min} and ${max}`);
  }
  return value;
}

export function getPagination(searchParams: URLSearchParams, defaultLimit = 50, maxLimit = 200) {
  const limit = integerParam(searchParams.get("limit"), "limit", 1, maxLimit) ?? defaultLimit;
  const offset = integerParam(searchParams.get("offset"), "offset", 0, 1_000_000) ?? 0;
  return { limit, offset };
}
