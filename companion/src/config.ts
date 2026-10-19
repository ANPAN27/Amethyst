import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type CompanionConfig = {
  server_url: string;
  token: string;
  companion_id: string;
  name: string;
  approved_paths: string[];
};

export function configPath(): string {
  return process.env.AMETHYST_CONFIG || join(homedir(), ".amethyst", "companion.json");
}

export async function loadConfig(): Promise<CompanionConfig> {
  const raw = await readFile(configPath(), "utf8");
  const parsed = JSON.parse(raw) as Partial<CompanionConfig>;
  if (!parsed.server_url || !parsed.token || !parsed.companion_id) {
    throw new Error("Companion configuration is incomplete. Run `pair` again.");
  }
  return {
    server_url: parsed.server_url,
    token: parsed.token,
    companion_id: parsed.companion_id,
    name: parsed.name ?? "amethyst-companion",
    approved_paths: Array.isArray(parsed.approved_paths) ? parsed.approved_paths : [],
  };
}

export async function saveConfig(config: CompanionConfig): Promise<void> {
  const path = configPath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(config, null, 2), { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
  await chmod(path, 0o600);
}
