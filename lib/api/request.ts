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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "invalid_request", "Malformed JSON body");
  }

  return schema.parse(body);
}

export function parseUuid(value: string, field = "id"): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) {
    throw new ApiError(400, "invalid_request", `Invalid ${field}`);
  }
  return parsed.data;
}

export function getPagination(searchParams: URLSearchParams, defaultLimit = 50, maxLimit = 200) {
  const limitRaw = searchParams.get("limit");
  const offsetRaw = searchParams.get("offset");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : defaultLimit;
  const offset = offsetRaw ? Number.parseInt(offsetRaw, 10) : 0;

  if (!Number.isFinite(limit) || limit < 1 || limit > maxLimit) {
    throw new ApiError(400, "invalid_request", `limit must be between 1 and ${maxLimit}`);
  }
  if (!Number.isFinite(offset) || offset < 0 || offset > 1_000_000) {
    throw new ApiError(400, "invalid_request", "offset must be between 0 and 1000000");
  }
  return { limit, offset };
}
