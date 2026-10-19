import { NextResponse } from "next/server";

export const runtime = "nodejs";

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PAIRING_CODE_SECRET",
  "COMPANION_TOKEN_SECRET",
] as const;

const OPTIONAL = [
  "APP_URL",
  "AI_API_KEY",
  "TIGERGRAPH_URL",
  "DODO_PAYMENTS_API_KEY",
  "DODO_PAYMENTS_WEBHOOK_KEY",
  "DODO_PRODUCT_CREDITS",
] as const;

function present(name: string): boolean {
  return Boolean(process.env[name] && process.env[name]!.trim().length > 0);
}

export async function GET() {
  const missingRequired = REQUIRED.filter((name) => !present(name));
  const missingOptional = OPTIONAL.filter((name) => !present(name));

  return NextResponse.json(
    {
      data: {
        status: missingRequired.length === 0 ? "ok" : "degraded",
        time: new Date().toISOString(),
        services: {
          supabase:
            present("NEXT_PUBLIC_SUPABASE_URL") &&
            present("NEXT_PUBLIC_SUPABASE_ANON_KEY") &&
            present("SUPABASE_SERVICE_ROLE_KEY"),
          companion: present("PAIRING_CODE_SECRET") && present("COMPANION_TOKEN_SECRET"),
          ai: present("AI_API_KEY"),
          tigerGraph: present("TIGERGRAPH_URL"),
          dodo: present("DODO_PAYMENTS_API_KEY") && present("DODO_PAYMENTS_WEBHOOK_KEY"),
        },
        warnings: [
          ...missingRequired.map((name) => `${name} is not set`),
          ...missingOptional.map((name) => `${name} is not set (optional)`),
        ],
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
