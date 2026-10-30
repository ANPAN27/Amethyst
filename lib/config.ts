import { z } from "zod";
import { detectAiProvider } from "@/lib/services/ai-provider";

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required server configuration: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

function intEnv(name: string, fallback: number): number {
  const raw = optional(name);
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid numeric configuration: ${name}`);
  }
  return value;
}

export const publicConfig = {
  get supabaseUrl() {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  },
  get supabaseAnonKey() {
    return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  },
  get appUrl() {
    const explicit = optional("APP_URL");
    if (explicit) return explicit;

    const vercel =
      optional("VERCEL_PROJECT_PRODUCTION_URL") ?? optional("VERCEL_URL");
    if (vercel) return vercel.startsWith("http") ? vercel : `https://${vercel}`;

    if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
    throw new Error("Missing required server configuration: APP_URL");
  },
};

export const serverConfig = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get pairingSecret() {
    return required("PAIRING_CODE_SECRET");
  },
  get companionTokenSecret() {
    return required("COMPANION_TOKEN_SECRET");
  },
  get artifactBucket() {
    return optional("ARTIFACT_BUCKET") ?? "analysis-artifacts";
  },
  get maxArtifactBytes() {
    return intEnv("MAX_ARTIFACT_BYTES", 25 * 1024 * 1024);
  },
  credits: {
    get aiChat() {
      return intEnv("CREDITS_AI_CHAT", 1);
    },
    get codegen() {
      return intEnv("CREDITS_CODEGEN", 5);
    },
  },
  ai: {
    get apiKey() {
      return required("AI_API_KEY");
    },
    get provider() {
      const configured = optional("AI_PROVIDER")?.toLowerCase();
      if (configured && !["auto", "openai", "gemini"].includes(configured)) {
        throw new Error("AI_PROVIDER must be auto, openai, or gemini");
      }
      return detectAiProvider(
        configured === "auto" ? undefined : configured,
        this.baseUrl,
      );
    },
    get baseUrl() {
      return optional("AI_BASE_URL") ?? "https://api.openai.com/v1";
    },
    get model() {
      const configured = optional("AI_MODEL");
      if (configured) return configured;

      if (this.provider === "gemini") {
        const fromUrl = /\/models\/([^/:]+):generateContent/i.exec(this.baseUrl)?.[1];
        if (fromUrl) return decodeURIComponent(fromUrl);
        throw new Error(
          "Missing required server configuration: AI_MODEL (set the Gemini model identifier)",
        );
      }

      return "gpt-4.1-mini";
    },
    get requestTimeoutMs() {
      return intEnv("AI_REQUEST_TIMEOUT_MS", 60_000);
    },
    get maxEvidenceChars() {
      return intEnv("AI_MAX_EVIDENCE_CHARS", 30_000);
    },
  },
  tigerGraph: {
    get url() {
      return optional("TIGERGRAPH_URL") ?? "";
    },
    get graph() {
      return optional("TIGERGRAPH_GRAPH") ?? "Amethyst";
    },
    get token() {
      return optional("TIGERGRAPH_TOKEN") ?? "";
    },
    get enabled() {
      return Boolean(optional("TIGERGRAPH_URL"));
    },
    get timeoutMs() {
      return intEnv("TIGERGRAPH_TIMEOUT_MS", 10_000);
    },
  },
  dodo: {
    get apiKey() {
      return required("DODO_PAYMENTS_API_KEY");
    },
    get webhookKey() {
      return required("DODO_PAYMENTS_WEBHOOK_KEY");
    },
    get environment() {
      const value = optional("DODO_ENVIRONMENT") ?? "test_mode";
      if (value !== "test_mode" && value !== "live_mode") {
        throw new Error("DODO_ENVIRONMENT must be test_mode or live_mode");
      }
      return value;
    },
  },
};

const productSchema = z.object({
  credits: z.number().int().positive().max(10_000_000),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  active: z.boolean().optional(),
  display_order: z.number().int().min(0).max(100_000).optional(),
  recommended: z.boolean().optional(),
});

export type CreditProduct = z.infer<typeof productSchema>;

/**
 * Products and credit amounts are configured on the server. A client may only
 * name a product id; it can never supply the amount or credit quantity.
 */
export function getCreditProducts(): Record<string, CreditProduct> {
  const raw = optional("DODO_PRODUCT_CREDITS");
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("DODO_PRODUCT_CREDITS must be valid JSON");
  }
  return z.record(z.string().min(1), productSchema).parse(parsed);
}

export function getCreditProduct(productId: string): CreditProduct | null {
  const products = getCreditProducts();
  return products[productId] ?? null;
}

export function dodoConfigured(): boolean {
  try {
    return Boolean(
      optional("DODO_PAYMENTS_API_KEY") &&
        optional("DODO_PAYMENTS_WEBHOOK_KEY") &&
        Object.keys(getCreditProducts()).length > 0,
    );
  } catch {
    return false;
  }
}

/**
 * Names of missing or invalid payment configuration. Never include values.
 */
export function paymentConfigurationIssues(): string[] {
  const issues: string[] = [];
  if (!optional("DODO_PAYMENTS_API_KEY")) issues.push("DODO_PAYMENTS_API_KEY");
  if (!optional("DODO_PAYMENTS_WEBHOOK_KEY")) issues.push("DODO_PAYMENTS_WEBHOOK_KEY");

  const environment = optional("DODO_ENVIRONMENT") ?? "test_mode";
  if (environment !== "test_mode" && environment !== "live_mode") {
    issues.push("DODO_ENVIRONMENT");
  }

  try {
    if (Object.keys(getCreditProducts()).length === 0) issues.push("DODO_PRODUCT_CREDITS");
  } catch {
    issues.push("DODO_PRODUCT_CREDITS (invalid JSON)");
  }

  try {
    void publicConfig.appUrl;
  } catch {
    issues.push("APP_URL");
  }

  return issues;
}
