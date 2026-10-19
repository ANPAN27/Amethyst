import "server-only";

import { createHmac, randomBytes, randomInt } from "node:crypto";
import type { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { serverConfig } from "@/lib/config";
import { ApiError } from "@/lib/api/errors";
import { getBearerToken } from "@/lib/api/auth";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PAIRING_TTL_MINUTES = 10;

export type CompanionRow = {
  id: string;
  owner_id: string;
  name: string;
  platform: string | null;
  version: string | null;
  capabilities: string[];
  status: "active" | "revoked";
  paired_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
};

function hmac(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function normalizePairingCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashPairingCode(code: string): string {
  return hmac(normalizePairingCode(code), serverConfig.pairingSecret);
}

function hashCompanionToken(token: string): string {
  return hmac(token, serverConfig.companionTokenSecret);
}

function generatePairingCode(): string {
  let raw = "";
  for (let index = 0; index < 12; index += 1) {
    raw += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

export function generateCompanionToken(): string {
  return `amc_${randomBytes(32).toString("base64url")}`;
}

export async function createPairingCode(user: User, companionName?: string) {
  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MINUTES * 60_000).toISOString();

  const { error } = await getSupabaseAdmin().from("pairing_codes").insert({
    owner_id: user.id,
    code_hash: hashPairingCode(code),
    companion_name: companionName ?? null,
    expires_at: expiresAt,
  });

  if (error) throw error;

  return {
    code,
    expires_at: expiresAt,
    expires_in_seconds: PAIRING_TTL_MINUTES * 60,
  };
}

export async function exchangePairingCode(input: {
  code: string;
  name: string;
  platform?: string;
  version?: string;
  capabilities?: string[];
}) {
  const token = generateCompanionToken();
  const tokenPrefix = token.slice(0, 12);

  const { data, error } = await getSupabaseAdmin().rpc("exchange_pairing_code", {
    p_code_hash: hashPairingCode(input.code),
    p_token_hash: hashCompanionToken(token),
    p_token_prefix: tokenPrefix,
    p_name: input.name,
    p_platform: input.platform ?? "",
    p_version: input.version ?? "",
    p_capabilities: input.capabilities ?? [],
  });

  if (error) {
    if ((error.message ?? "").includes("invalid_pairing_code")) {
      throw new ApiError(401, "unauthorized", "Pairing code is invalid, expired or already used");
    }
    throw error;
  }

  return { token, companion: data };
}

export async function authenticateCompanion(request: NextRequest): Promise<CompanionRow> {
  const token = getBearerToken(request);
  if (!token || !token.startsWith("amc_")) {
    throw new ApiError(401, "unauthorized", "Companion credentials required");
  }

  const { data, error } = await getSupabaseAdmin()
    .from("companion_credentials")
    .select(
      "companion_id, companions!inner(id, owner_id, name, platform, version, capabilities, status, paired_at, last_seen_at, revoked_at)",
    )
    .eq("token_hash", hashCompanionToken(token))
    .maybeSingle();

  if (error) throw error;

  const companion = data?.companions as unknown as CompanionRow | undefined;
  if (!companion || companion.status !== "active") {
    throw new ApiError(401, "unauthorized", "Companion is not active");
  }

  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  await Promise.all([
    admin
      .from("companion_credentials")
      .update({ last_used_at: now })
      .eq("companion_id", companion.id),
    admin.from("companions").update({ last_seen_at: now }).eq("id", companion.id),
  ]);

  return companion;
}

export async function revokeCompanionSelf(companion: CompanionRow): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("companions")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", companion.id)
    .eq("owner_id", companion.owner_id);

  if (error) throw error;

  const { error: credentialError } = await admin
    .from("companion_credentials")
    .delete()
    .eq("companion_id", companion.id);

  if (credentialError) throw credentialError;
}

export async function listCompanions(user: User) {
  const { data, error } = await getSupabaseAdmin()
    .from("companions")
    .select("id, name, platform, version, capabilities, status, paired_at, last_seen_at, revoked_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function revokeCompanion(user: User, companionId: string) {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("companions")
    .update({ status: "revoked", revoked_at: now })
    .eq("id", companionId)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ApiError(404, "not_found", "Companion not found");

  const { error: credentialError } = await admin
    .from("companion_credentials")
    .delete()
    .eq("companion_id", companionId);

  if (credentialError) throw credentialError;
}
