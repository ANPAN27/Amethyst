import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "conflict"
  | "rate_limited"
  | "insufficient_credits"
  | "upstream_unavailable"
  | "internal_error";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function jsonOk<T>(data: T, status = 200, headers?: HeadersInit) {
  return NextResponse.json(
    { data },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...headers,
      },
    },
  );
}

export function jsonError(error: ApiError) {
  return NextResponse.json(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    },
    {
      status: error.status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function isPgError(error: unknown): error is { code?: string; message?: string } {
  return typeof error === "object" && error !== null;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    return new ApiError(
      400,
      "invalid_request",
      "Request validation failed",
      error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  if (error instanceof SyntaxError) {
    return new ApiError(400, "invalid_request", "Malformed JSON body");
  }

  if (isPgError(error)) {
    const message = error.message ?? "";
    if (message.includes("insufficient_credits")) {
      return new ApiError(402, "insufficient_credits", "Not enough credits for this operation");
    }
    if (message.includes("job_not_open")) {
      return new ApiError(409, "conflict", "This job is no longer open");
    }
    if (message.includes("job_not_found")) {
      return new ApiError(404, "not_found", "Job not found");
    }
    if (message.includes("reservation_not_found")) {
      return new ApiError(409, "conflict", "Credit reservation not found");
    }
  }

  return new ApiError(500, "internal_error", "An unexpected error occurred");
}

export async function withRouteHandler(
  handler: () => Promise<Response>,
  operation = "route",
): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    const apiError = toApiError(error);
    const cause =
      error instanceof Error
        ? {
            name: error.name,
            code: (error as { code?: string }).code ?? null,
            message: error.message.slice(0, 300),
          }
        : { type: typeof error };
    // Never log request bodies, tokens, pairing codes or provider secrets.
    console.error(
      `[api] ${operation} ${apiError.status} ${apiError.code}: ${apiError.message}`,
      cause,
    );
    return jsonError(apiError);
  }
}
