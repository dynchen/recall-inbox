import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { AppConfig } from "./types.js";

function loadDotEnv(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};

  const values: Record<string, string> = {};
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    values[key] = rawValue.replace(/^["']|["']$/g, "");
  }
  return values;
}

function envValue(dotEnv: Record<string, string>, key: string): string | undefined {
  return process.env[key] ?? dotEnv[key];
}

export function loadConfig(cwd = process.cwd()): AppConfig {
  const dotEnv = loadDotEnv(path.join(cwd, ".env"));

  return {
    adminSecret: envValue(dotEnv, "ADMIN_SECRET") || envValue(dotEnv, "CRON_SECRET") || undefined,
    xClientId: envValue(dotEnv, "X_CLIENT_ID") || undefined,
    xClientSecret: envValue(dotEnv, "X_CLIENT_SECRET") || undefined,
    xRedirectUri:
      envValue(dotEnv, "X_REDIRECT_URI") ?? "http://127.0.0.1:17863/callback",
    dataDir: envValue(dotEnv, "DATA_DIR") ?? ".data",
    outputDir: envValue(dotEnv, "OUTPUT_DIR") ?? "outputs/daily",
    summaryApiKey: envValue(dotEnv, "SUMMARY_API_KEY") || undefined,
    summaryModel: envValue(dotEnv, "SUMMARY_MODEL") ?? "gpt-4.1-mini",
    summaryBaseUrl: envValue(dotEnv, "SUMMARY_BASE_URL") ?? "https://api.openai.com/v1/responses",
    githubToken: envValue(dotEnv, "GITHUB_TOKEN") || undefined
  };
}
