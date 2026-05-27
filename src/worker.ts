import { createAppHandler, runRuntimeSync, type RuntimeSyncOptions } from "./runtime/app.js";
import { demoItems } from "./demoItems.js";
import { D1Store, type D1Database } from "./store/d1Store.js";
import type { AppConfig } from "./types.js";

interface Env {
  DB?: D1Database;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  ADMIN_SECRET?: string;
  CRON_SECRET?: string;
  X_CLIENT_ID?: string;
  X_CLIENT_SECRET?: string;
  X_REDIRECT_URI?: string;
  GITHUB_TOKEN?: string;
  SUMMARY_API_KEY?: string;
  SUMMARY_MODEL?: string;
  SUMMARY_BASE_URL?: string;
  SYNC_MAX_PAGES_PER_SOURCE?: string;
  DEMO_MODE?: string;
}

function configFromEnv(env: Env, requestUrl?: URL): AppConfig {
  return {
    xClientId: env.X_CLIENT_ID,
    xClientSecret: env.X_CLIENT_SECRET,
    xRedirectUri: env.X_REDIRECT_URI ?? `${requestUrl?.origin ?? "http://127.0.0.1:17863"}/api/auth/x/callback`,
    dataDir: ".data",
    outputDir: "outputs/daily",
    summaryApiKey: env.SUMMARY_API_KEY,
    summaryModel: env.SUMMARY_MODEL ?? "gpt-4.1-mini",
    summaryBaseUrl: env.SUMMARY_BASE_URL ?? "https://api.openai.com/v1/responses",
    githubToken: env.GITHUB_TOKEN
  };
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function adminSecret(env: Env): string | undefined {
  return env.ADMIN_SECRET ?? env.CRON_SECRET;
}

export async function runCloudflareSync(env: Env, options: RuntimeSyncOptions = {}) {
  if (env.DEMO_MODE === "true") {
    return { fetched: 0, newItems: 0, stored: demoItems.length, sources: {} };
  }
  if (!env.DB) throw new Error("DB binding is required.");
  return runRuntimeSync(
    new D1Store(env.DB),
    configFromEnv(env),
    options,
    options.maxPages ?? parsePositiveNumber(env.SYNC_MAX_PAGES_PER_SOURCE) ?? 2
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return createAppHandler({
        createStore: () => {
          if (!env.DB) throw new Error("DB binding is required.");
          return new D1Store(env.DB);
        },
        config: configFromEnv(env, url),
        adminSecret: adminSecret(env),
        demoItems: env.DEMO_MODE === "true" ? demoItems : undefined,
        syncMaxPagesPerSource: parsePositiveNumber(env.SYNC_MAX_PAGES_PER_SOURCE)
      })(request);
    }
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not found", { status: 404 });
  },

  async scheduled(_event: unknown, env: Env): Promise<void> {
    await runCloudflareSync(env);
  }
};
