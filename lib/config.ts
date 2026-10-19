import { z } from "zod";

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
    return optional("APP_URL") ?? "http://localhost:3000";
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
    get baseUrl() {
      return optional("AI_BASE_URL") ?? "https://api.openai.com/v1";
    },
    get model() {
      return optional("AI_MODEL") ?? "gpt-4.1-mini";
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
