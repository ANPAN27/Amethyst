export class ClientApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ClientApiError";
    this.status = status;
    this.code = code;
  }
}

type ApiEnvelope<T> = { data: T };
type ApiErrorEnvelope = { error?: { code?: string; message?: string } };

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      credentials: "same-origin",
      redirect: "error",
    });
  } catch {
    throw new ClientApiError(0, "network_error", "Unable to reach the Amethyst server");
  }

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const error = (body as ApiErrorEnvelope | null)?.error;
    throw new ClientApiError(
      response.status,
      error?.code ?? "request_failed",
      error?.message ?? `Request failed with HTTP ${response.status}`,
    );
  }

  return (body as ApiEnvelope<T>).data;
}
