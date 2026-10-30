export const COMPANION_PACKAGE_NAME = "amethyst-companion";
export const COMPANION_VERSION = "0.1.0";
export const COMPANION_INSTALL_SCRIPT = "install-amethyst-companion.sh";
export const COMPANION_STALE_AFTER_MS = 60_000;

export type CompanionPlatform = "linux" | "macos" | "windows" | "other";
export type CompanionConnectionState = "connected" | "waiting" | "not_paired" | "revoked";

export type CompanionPresence = {
  status: string;
  last_seen_at: string | null;
  revoked_at?: string | null;
};

export function companionTarballName(version = COMPANION_VERSION): string {
  return `${COMPANION_PACKAGE_NAME}-${version}.tgz`;
}

export function normalizeOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (url.username || url.password || url.search || url.hash) return "";
    if (url.pathname !== "/") return "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

export function companionInstallScriptUrl(origin: string): string {
  const base = normalizeOrigin(origin);
  return base ? `${base}/downloads/${COMPANION_INSTALL_SCRIPT}` : "";
}

export function companionTarballUrl(origin: string, version = COMPANION_VERSION): string {
  const base = normalizeOrigin(origin);
  return base ? `${base}/downloads/${companionTarballName(version)}` : "";
}

export function companionInstallCommands(origin: string, version = COMPANION_VERSION) {
  const base = normalizeOrigin(origin);
  if (!base) {
    return {
      installScriptUrl: "",
      tarballUrl: "",
      downloadCommand: "",
      installCommand: "",
    };
  }

  const scriptUrl = companionInstallScriptUrl(base);
  return {
    installScriptUrl: scriptUrl,
    tarballUrl: companionTarballUrl(base, version),
    downloadCommand: `curl -fsSLO ${scriptUrl}`,
    installCommand: `sh ${COMPANION_INSTALL_SCRIPT} --base-url ${base}`,
  };
}

export function detectCompanionPlatform(
  userAgent = "",
  platform = "",
): CompanionPlatform {
  const value = `${userAgent} ${platform}`.toLowerCase();
  if (value.includes("windows") || value.includes("win32") || value.includes("win64")) {
    return "windows";
  }
  if (value.includes("macintosh") || value.includes("mac os") || value.includes("macintel")) {
    return "macos";
  }
  if (value.includes("linux") || value.includes("x11")) return "linux";
  return "other";
}

function seenAt(companion: CompanionPresence): number | null {
  if (!companion.last_seen_at) return null;
  const value = new Date(companion.last_seen_at).getTime();
  return Number.isFinite(value) ? value : null;
}

export function companionConnectionState(
  companions: CompanionPresence[],
  now = Date.now(),
): CompanionConnectionState {
  const active = companions.filter((companion) => companion.status === "active");
  if (active.length > 0) {
    const latest = Math.max(...active.map((companion) => seenAt(companion) ?? 0));
    if (latest > 0 && now - latest <= COMPANION_STALE_AFTER_MS) return "connected";
    return "waiting";
  }
  if (companions.some((companion) => companion.status === "revoked")) return "revoked";
  return "not_paired";
}

export function isCompanionConnected(
  companion: CompanionPresence,
  now = Date.now(),
): boolean {
  if (companion.status !== "active") return false;
  const latest = seenAt(companion);
  return latest !== null && now - latest <= COMPANION_STALE_AFTER_MS;
}
