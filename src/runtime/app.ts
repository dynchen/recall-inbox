import { createGitHubSyncSource, createXSyncSource, runSyncSources } from "../jobs/sync.js";
import { readReviewItemsFromStore, updateReviewItemInStore } from "../review.js";
import { requestXToken } from "../sources/x/token.js";
import type { AppConfig, SavedItem } from "../types.js";
import type { RuntimeStore } from "./store.js";

const X_AUTH_URL = "https://x.com/i/oauth2/authorize";
const X_SCOPES = ["tweet.read", "users.read", "bookmark.read", "offline.access"];

export type SyncSourceFilter = "all" | "x" | "github";

export interface RuntimeSyncOptions {
  source?: SyncSourceFilter;
  maxPages?: number;
  fullScan?: boolean;
}

export interface RuntimeAppOptions {
  createStore(): RuntimeStore;
  config: AppConfig;
  adminSecret?: string;
  demoItems?: SavedItem[];
  syncMaxPagesPerSource?: number;
}

interface SourceAdminStatus {
  configured: boolean;
  authorized: boolean;
  syncEnabled: boolean;
  reason?: string;
}

interface AdminStatus {
  sources: Record<"x" | "github", SourceAdminStatus>;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...init?.headers
    }
  });
}

function textResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, {
    ...init,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      ...init?.headers
    }
  });
}

async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return base64Url(new Uint8Array(digest));
}

function xRedirectUri(requestUrl: URL, config: AppConfig): string {
  return config.xRedirectUri || `${requestUrl.origin}/api/auth/x/callback`;
}

function hasValidSecret(request: Request, url: URL, secret: string | undefined): boolean {
  return (
    !!secret &&
    (request.headers.get("Authorization") === `Bearer ${secret}` ||
      url.searchParams.get("token") === secret)
  );
}

function requireAdminSecret(request: Request, secret: string | undefined): Response | undefined {
  if (!secret) {
    return jsonResponse({ error: "ADMIN_SECRET is required." }, { status: 500 });
  }
  if (request.headers.get("Authorization") !== `Bearer ${secret}`) {
    return jsonResponse({ error: "Unauthorized." }, { status: 401 });
  }
  return undefined;
}

function parsePositiveNumber(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function syncOptionsFromUrl(url: URL): RuntimeSyncOptions | Response {
  const source = url.searchParams.get("source") ?? "all";
  if (source !== "all" && source !== "x" && source !== "github") {
    return jsonResponse({ error: "Invalid sync source." }, { status: 400 });
  }

  return {
    source,
    maxPages: parsePositiveNumber(url.searchParams.get("maxPages")),
    fullScan: url.searchParams.get("fullScan") === "true"
  };
}

async function readAdminStatus(config: AppConfig, store: RuntimeStore): Promise<AdminStatus> {
  const xToken = await store.readXToken();
  const xConfigured = Boolean(config.xClientId);
  const githubConfigured = Boolean(config.githubToken);
  return {
    sources: {
      x: {
        configured: xConfigured,
        authorized: Boolean(xToken),
        syncEnabled: xConfigured && Boolean(xToken),
        ...(!xConfigured
          ? { reason: "X_CLIENT_ID is not configured." }
          : !xToken
            ? { reason: "Authorize X before syncing." }
            : {})
      },
      github: {
        configured: githubConfigured,
        authorized: githubConfigured,
        syncEnabled: githubConfigured,
        ...(!githubConfigured ? { reason: "GITHUB_TOKEN is not configured." } : {})
      }
    }
  };
}

async function validateSyncReadiness(
  config: AppConfig,
  store: RuntimeStore,
  source: SyncSourceFilter
): Promise<Response | undefined> {
  const status = await readAdminStatus(config, store);
  if (source === "all") {
    return Object.values(status.sources).some((sourceStatus) => sourceStatus.syncEnabled)
      ? undefined
      : jsonResponse({ error: "No sources are ready to sync.", sources: status.sources }, { status: 400 });
  }

  const sourceStatus = status.sources[source];
  return sourceStatus.syncEnabled
    ? undefined
    : jsonResponse({ error: sourceStatus.reason ?? `${source} is not ready to sync.`, sources: status.sources }, { status: 400 });
}

async function handleXAuthStart(
  request: Request,
  url: URL,
  options: RuntimeAppOptions,
  store: RuntimeStore
): Promise<Response> {
  if (!hasValidSecret(request, url, options.adminSecret)) {
    return jsonResponse({ error: "Unauthorized." }, { status: 401 });
  }
  if (!options.config.xClientId) {
    return jsonResponse({ error: "X_CLIENT_ID is required." }, { status: 400 });
  }

  const state = randomBase64Url(16);
  const codeVerifier = randomBase64Url(32);
  const redirectUri = xRedirectUri(url, options.config);
  await store.writeOAuthState({
    state,
    codeVerifier,
    redirectUri,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString()
  });

  const authUrl = new URL(X_AUTH_URL);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", options.config.xClientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", X_SCOPES.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", await sha256Base64Url(codeVerifier));
  authUrl.searchParams.set("code_challenge_method", "S256");

  if (request.method === "POST") {
    return jsonResponse({ authorizationUrl: authUrl.toString() });
  }
  return new Response(null, { status: 302, headers: { Location: authUrl.toString() } });
}

async function handleXAuthCallback(url: URL, options: RuntimeAppOptions, store: RuntimeStore): Promise<Response> {
  const error = url.searchParams.get("error");
  if (error) return textResponse(`X authorization failed: ${error}`, { status: 400 });

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return textResponse("OAuth callback state mismatch or missing code.", { status: 400 });
  }
  if (!options.config.xClientId) {
    return textResponse("X_CLIENT_ID is required.", { status: 400 });
  }

  const row = await store.readOAuthState(state);
  if (!row || Date.parse(row.expiresAt) <= Date.now()) {
    return textResponse("OAuth state expired or not found.", { status: 400 });
  }

  const token = await requestXToken(options.config, new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: row.redirectUri,
    client_id: options.config.xClientId,
    code_verifier: row.codeVerifier
  }));
  await store.deleteOAuthState(state);
  await store.writeXToken(token);

  return new Response(null, {
    status: 302,
    headers: { Location: `${url.origin}/` }
  });
}

export async function runRuntimeSync(
  store: RuntimeStore,
  config: AppConfig,
  options: RuntimeSyncOptions = {},
  defaultMaxPages = 2
) {
  const sourceOptions = { maxPages: options.maxPages ?? defaultMaxPages, fullScan: options.fullScan };
  const sourceFilter = options.source ?? "all";
  const sources = [];
  const xToken = await store.readXToken();
  if (sourceFilter === "x" || (sourceFilter === "all" && (config.xClientId || xToken))) {
    sources.push(createXSyncSource(config, store, sourceOptions));
  }
  if ((sourceFilter === "github" || sourceFilter === "all") && config.githubToken) {
    sources.push(createGitHubSyncSource(config, sourceOptions));
  }
  const result = await runSyncSources(store, sources);
  return {
    fetched: result.fetched,
    newItems: result.newItems.length,
    stored: result.items.length,
    sources: result.sources
  };
}

export function createAppHandler(options: RuntimeAppOptions): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const url = new URL(request.url);

      if ((request.method === "GET" || request.method === "POST") && url.pathname === "/api/auth/x/start") {
        return handleXAuthStart(request, url, options, options.createStore());
      }

      if (request.method === "GET" && url.pathname === "/api/auth/x/callback") {
        return handleXAuthCallback(url, options, options.createStore());
      }

      if (request.method === "GET" && url.pathname === "/api/items") {
        if (options.demoItems) {
          return jsonResponse({ demo: true, items: options.demoItems });
        }
        const unauthorized = requireAdminSecret(request, options.adminSecret);
        if (unauthorized) return unauthorized;
        return jsonResponse({ items: await readReviewItemsFromStore(options.createStore()) });
      }

      if (request.method === "GET" && url.pathname === "/api/admin/status") {
        if (options.demoItems) {
          return jsonResponse({
            sources: {
              x: { configured: false, authorized: false, syncEnabled: false, reason: "Demo mode does not sync sources." },
              github: { configured: false, authorized: false, syncEnabled: false, reason: "Demo mode does not sync sources." }
            }
          });
        }
        const unauthorized = requireAdminSecret(request, options.adminSecret);
        if (unauthorized) return unauthorized;
        return jsonResponse(await readAdminStatus(options.config, options.createStore()));
      }

      const itemMatch = /^\/api\/items\/(.+)$/.exec(url.pathname);
      if (request.method === "PATCH" && itemMatch) {
        if (options.demoItems) {
          const id = decodeURIComponent(itemMatch[1]);
          const item = options.demoItems.find((demoItem) => demoItem.id === id);
          return item
            ? jsonResponse({ item: { ...item, ...(await readJsonBody(request) as Partial<SavedItem>) } })
            : jsonResponse({ error: "Item not found." }, { status: 404 });
        }
        const unauthorized = requireAdminSecret(request, options.adminSecret);
        if (unauthorized) return unauthorized;
        const item = await updateReviewItemInStore(
          options.createStore(),
          decodeURIComponent(itemMatch[1]),
          await readJsonBody(request)
        );
        return item
          ? jsonResponse({ item })
          : jsonResponse({ error: "Item not found." }, { status: 404 });
      }

      if (request.method === "POST" && url.pathname === "/api/sync") {
        if (options.demoItems) {
          return jsonResponse({ error: "Demo mode does not sync sources." }, { status: 400 });
        }
        const unauthorized = requireAdminSecret(request, options.adminSecret);
        if (unauthorized) return unauthorized;
        const syncOptions = syncOptionsFromUrl(url);
        if (syncOptions instanceof Response) return syncOptions;
        const store = options.createStore();
        const notReady = await validateSyncReadiness(options.config, store, syncOptions.source ?? "all");
        if (notReady) return notReady;
        return jsonResponse(
          await runRuntimeSync(store, options.config, syncOptions, options.syncMaxPagesPerSource ?? 2)
        );
      }

      return jsonResponse({ error: "Not found." }, { status: 404 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Internal server error.";
      return jsonResponse({ error: message }, { status: message.startsWith("Invalid") ? 400 : 500 });
    }
  };
}
