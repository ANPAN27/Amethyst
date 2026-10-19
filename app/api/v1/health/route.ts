import { NextResponse } from "next/server";
import { serverConfig } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  const configured = {
    supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    ai: Boolean(process.env.AI_API_KEY),
    tigerGraph: Boolean(process.env.TIGERGRAPH_URL),
    dodo: Boolean(process.env.DODO_PAYMENTS_API_KEY && process.env.DODO_PAYMENTS_WEBHOOK_KEY),
  };

  const appUrlConfigured = Boolean(process.env.APP_URL);

  return NextResponse.json(
    {
      data: {
        status: "ok",
        time: new Date().toISOString(),
        services: configured,
        warnings: appUrlConfigured ? [] : ["APP_URL is not set"],
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// Referenced so a missing required secret fails clearly at runtime, not build.
void serverConfig;
