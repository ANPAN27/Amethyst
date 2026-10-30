import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  companionConnectionState,
  companionInstallCommands,
  companionInstallScriptUrl,
  companionTarballName,
  detectCompanionPlatform,
  isCompanionConnected,
} from "@/lib/companion-install";

const now = new Date("2026-10-29T12:00:00.000Z").getTime();

describe("standalone companion installation metadata", () => {
  it("builds download commands from the current Amethyst origin", () => {
    const commands = companionInstallCommands("https://amethyst.example/");

    expect(commands.installScriptUrl).toBe(
      "https://amethyst.example/downloads/install-amethyst-companion.sh",
    );
    expect(commands.installCommand).toContain("--base-url https://amethyst.example");
    expect(commands.installCommand).not.toContain("npm run companion:setup");
    expect(commands.installCommand).not.toContain("/path/to/amethyst");
  });

  it("rejects malformed origins instead of producing unsafe links", () => {
    expect(companionInstallScriptUrl("javascript:alert(1)")).toBe("");
    expect(companionInstallScriptUrl("https://user:pass@example.com")).toBe("");
    expect(companionInstallScriptUrl("https://example.com/?x=1")).toBe("");
    expect(companionInstallScriptUrl("https://example.com/app")).toBe("");
  });

  it("uses a versioned tarball name", () => {
    expect(companionTarballName("1.2.3")).toBe("amethyst-companion-1.2.3.tgz");
  });

  it("does not send users to a source checkout for onboarding", () => {
    const files = [
      "README.md",
      "companion/README.md",
      "docs/DEPLOYMENT.md",
      "components/projects/add-target-dialog.tsx",
      "components/settings/companion-settings.tsx",
    ];
    for (const file of files) {
      const contents = readFileSync(join(process.cwd(), file), "utf8");
      expect(contents, file).not.toContain("npm run companion:setup");
      expect(contents, file).not.toContain("/path/to/amethyst");
    }
  });

  it("ships an installer that does not require the Amethyst repository", () => {
    const installer = readFileSync(
      join(process.cwd(), "companion", "install.sh"),
      "utf8",
    );
    expect(installer).not.toContain("npm run companion:setup");
    expect(installer).not.toContain("Amethyst repository");
    expect(installer).toContain("npm install");
    expect(installer).toContain("--prefix");
    expect(installer).toContain("--uninstall");
    expect(installer).toContain("--purge");
  });
});

describe("companion platform detection", () => {
  it("detects the supported desktop platforms", () => {
    expect(detectCompanionPlatform("Mozilla/5.0 (X11; Linux x86_64)", "Linux x86_64")).toBe(
      "linux",
    );
    expect(detectCompanionPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X)", "MacIntel")).toBe(
      "macos",
    );
    expect(detectCompanionPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32")).toBe(
      "windows",
    );
    expect(detectCompanionPlatform("", "")).toBe("other");
  });
});

describe("companion connection state", () => {
  it("distinguishes connected, waiting, revoked, and never paired", () => {
    expect(
      companionConnectionState([
        { status: "active", last_seen_at: new Date(now - 15_000).toISOString() },
      ], now),
    ).toBe("connected");
    expect(
      companionConnectionState([
        { status: "active", last_seen_at: new Date(now - 5 * 60_000).toISOString() },
      ], now),
    ).toBe("waiting");
    expect(
      companionConnectionState([
        { status: "revoked", last_seen_at: null, revoked_at: new Date(now).toISOString() },
      ], now),
    ).toBe("revoked");
    expect(companionConnectionState([], now)).toBe("not_paired");
  });

  it("does not report a revoked companion as connected", () => {
    expect(
      isCompanionConnected(
        { status: "revoked", last_seen_at: new Date(now).toISOString(), revoked_at: new Date(now).toISOString() },
        now,
      ),
    ).toBe(false);
  });
});
