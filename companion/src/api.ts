export type ApiErrorBody = {
  error?: { code?: string; message?: string };
};

export class CompanionApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "CompanionApiError";
    this.status = status;
    this.code = code;
  }
}

export function normalizeServerUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Server URL must use http or https");
  }
  if (url.username || url.password) {
    throw new Error("Server URL must not contain embedded credentials");
  }
  if (url.search || url.hash) {
    throw new Error("Server URL must not contain a query or fragment");
  }
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol === "http:" && !isLocal && process.env.AMETHYST_ALLOW_INSECURE_HTTP !== "1") {
    throw new Error("Refusing plaintext HTTP for a non-local server. Use HTTPS.");
  }
  return url.toString().replace(/\/+$/, "");
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly token: string | null;

  constructor(serverUrl: string, token: string | null = null) {
    this.baseUrl = normalizeServerUrl(serverUrl);
    this.token = token;
  }

  get serverUrl(): string {
    return this.baseUrl;
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((init.headers as Record<string, string> | undefined) ?? {}),
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new CompanionApiError(0, "network_error", "Unable to reach the Amethyst server");
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
      const apiError = (body as ApiErrorBody | null)?.error;
      throw new CompanionApiError(
        response.status,
        apiError?.code ?? "request_failed",
        apiError?.message ?? `Request failed with HTTP ${response.status}`,
      );
    }

    return body as T;
  }

  async pair(input: {
    code: string;
    name: string;
    platform: string;
    version: string;
    capabilities: string[];
  }): Promise<{ data: { token: string; companion: { companion_id: string; name: string } } }> {
    return this.request(
      "/api/v1/companion/pair",
      { method: "POST", body: JSON.stringify(input) },
      20_000,
    );
  }

  async claimJob<T>(): Promise<T> {
    return this.request("/api/v1/companion/jobs/next", { method: "POST", body: "{}" }, 35_000);
  }

  async me(): Promise<{ data: unknown }> {
    return this.request("/api/v1/companion/me", { method: "GET" }, 20_000);
  }

  async revokeSelf(): Promise<void> {
    await this.request("/api/v1/companion/me", { method: "DELETE" }, 20_000);
  }

  async progress(jobId: string, progress: number, message?: string): Promise<void> {
    await this.request(
      `/api/v1/companion/jobs/${encodeURIComponent(jobId)}/progress`,
      { method: "POST", body: JSON.stringify({ progress, ...(message ? { message } : {}) }) },
      20_000,
    );
  }

  async requestUploadUrl(jobId: string): Promise<{
    data: {
      bucket: string;
      path: string;
      token: string;
      signed_url: string;
      max_bytes: number;
    };
  }> {
    return this.request(
      `/api/v1/companion/jobs/${encodeURIComponent(jobId)}/artifact`,
      { method: "POST", body: "{}" },
      20_000,
    );
  }

  async uploadArtifact(signedUrl: string, body: Buffer): Promise<void> {
    const url = new URL(signedUrl, `${this.baseUrl}/`);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: new Uint8Array(body),
        redirect: "error",
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new CompanionApiError(0, "upload_failed", "Artifact upload failed");
    }
    if (!response.ok) {
      throw new CompanionApiError(
        response.status,
        "upload_failed",
        `Artifact upload failed with HTTP ${response.status}`,
      );
    }
  }

  async submitResult(jobId: string, payload: unknown): Promise<unknown> {
    return this.request(
      `/api/v1/companion/jobs/${encodeURIComponent(jobId)}/result`,
      { method: "POST", body: JSON.stringify(payload) },
      90_000,
    );
  }
}
