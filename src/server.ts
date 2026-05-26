#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./env.js";
import { readReviewItemsFromStore, updateReviewItemInStore } from "./review.js";
import { JsonStore } from "./store/jsonStore.js";
import type { SavedItem } from "./types.js";

interface ServerOptions {
  dataDir: string;
  staticDir: string;
}

function sendJson(response: http.ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

export async function readReviewItems(dataDir: string): Promise<SavedItem[]> {
  return readReviewItemsFromStore(new JsonStore(dataDir));
}

export async function updateReviewItem(
  dataDir: string,
  id: string,
  body: unknown
): Promise<SavedItem | null> {
  return updateReviewItemInStore(new JsonStore(dataDir), id, body);
}

function contentType(filePath: string): string {
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  return "application/octet-stream";
}

async function serveStatic(
  staticDir: string,
  requestPath: string,
  response: http.ServerResponse
): Promise<void> {
  const relativePath = requestPath === "/" ? "index.html" : decodeURIComponent(requestPath.slice(1));
  const staticRoot = path.resolve(staticDir);
  const filePath = path.resolve(staticDir, relativePath);
  if (filePath !== staticRoot && !filePath.startsWith(`${staticRoot}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": contentType(filePath) });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      response.writeHead(404).end("Not found");
      return;
    }
    throw error;
  }
}

export function createReviewServer(options: ServerOptions): http.Server {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (request.method === "GET" && url.pathname === "/api/items") {
        sendJson(response, 200, { items: await readReviewItems(options.dataDir) });
        return;
      }

      const itemMatch = /^\/api\/items\/(.+)$/.exec(url.pathname);
      if (request.method === "PATCH" && itemMatch) {
        const item = await updateReviewItem(
          options.dataDir,
          decodeURIComponent(itemMatch[1]),
          await readJsonBody(request)
        );
        if (!item) {
          sendJson(response, 404, { error: "Item not found." });
          return;
        }
        sendJson(response, 200, { item });
        return;
      }

      if (url.pathname.startsWith("/api/")) {
        sendJson(response, 404, { error: "Not found." });
        return;
      }

      await serveStatic(options.staticDir, url.pathname, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Internal server error.";
      sendJson(response, message.startsWith("Invalid") ? 400 : 500, { error: message });
    }
  });
}

function defaultStaticDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(thisFile), "../view");
}

async function main(): Promise<void> {
  const config = loadConfig();
  const port = Number(process.env.VIEW_PORT ?? "17864");
  const server = createReviewServer({ dataDir: config.dataDir, staticDir: defaultStaticDir() });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Review page: http://127.0.0.1:${port}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
