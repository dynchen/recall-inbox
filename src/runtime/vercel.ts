import type { IncomingMessage, ServerResponse } from "node:http";
import { createAppHandler, runRuntimeSync } from "./app.js";
import { createPostgresClient, PostgresStore } from "../store/postgresStore.js";
import type { AppConfig } from "../types.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function optionalPositiveNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function configFromProcessEnv(origin: string): AppConfig {
  return {
    xClientId: process.env.X_CLIENT_ID || undefined,
    xClientSecret: process.env.X_CLIENT_SECRET || undefined,
    xRedirectUri: process.env.X_REDIRECT_URI || `${origin}/api/auth/x/callback`,
    dataDir: ".data",
    outputDir: "outputs/daily",
    summaryApiKey: process.env.SUMMARY_API_KEY || undefined,
    summaryModel: process.env.SUMMARY_MODEL || "gpt-4.1-mini",
    summaryBaseUrl: process.env.SUMMARY_BASE_URL || "https://api.openai.com/v1/responses",
    githubToken: process.env.GITHUB_TOKEN || undefined
  };
}

function requestOrigin(request: IncomingMessage): string {
  const protocol = request.headers["x-forwarded-proto"] ?? "https";
  const host = request.headers.host ?? "localhost";
  return `${Array.isArray(protocol) ? protocol[0] : protocol}://${host}`;
}

function requestBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

async function toWebRequest(request: IncomingMessage, pathOverride?: string): Promise<Request> {
  const origin = requestOrigin(request);
  const url = new URL(request.url ?? "/", origin);
  if (pathOverride) url.pathname = pathOverride;
  const method = request.method ?? "GET";
  return new Request(url, {
    method,
    headers: request.headers as HeadersInit,
    body: method === "GET" || method === "HEAD" ? undefined : await requestBody(request)
  });
}

async function sendResponse(response: Response, serverResponse: ServerResponse): Promise<void> {
  serverResponse.statusCode = response.status;
  response.headers.forEach((value, key) => serverResponse.setHeader(key, value));
  serverResponse.end(Buffer.from(await response.arrayBuffer()));
}

export function createVercelStore(): PostgresStore {
  return new PostgresStore(createPostgresClient(requiredEnv("POSTGRES_URL")));
}

export async function handleVercelRequest(request: Request): Promise<Response> {
  const origin = new URL(request.url).origin;
  return createAppHandler({
    createStore: createVercelStore,
    config: configFromProcessEnv(origin),
    adminSecret: process.env.ADMIN_SECRET,
    syncMaxPagesPerSource: optionalPositiveNumber(process.env.SYNC_MAX_PAGES_PER_SOURCE)
  })(request);
}

export async function handleVercelNodeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  pathOverride?: string
): Promise<void> {
  await sendResponse(await handleVercelRequest(await toWebRequest(request, pathOverride)), response);
}

export async function handleVercelCronSync(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const webRequest = await toWebRequest(request, "/api/cron/sync");
  if (process.env.CRON_SECRET && webRequest.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    await sendResponse(new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    }), response);
    return;
  }

  const origin = new URL(webRequest.url).origin;
  const result = await runRuntimeSync(
    createVercelStore(),
    configFromProcessEnv(origin),
    {},
    optionalPositiveNumber(process.env.SYNC_MAX_PAGES_PER_SOURCE) ?? 2
  );
  await sendResponse(new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json; charset=utf-8" }
  }), response);
}
