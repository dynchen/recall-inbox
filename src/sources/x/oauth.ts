import crypto from "node:crypto";
import http from "node:http";
import { URL } from "node:url";
import type { AppConfig, XTokenSet } from "../../types.js";
import { requestXToken } from "./token.js";

const AUTH_URL = "https://x.com/i/oauth2/authorize";
const SCOPES = ["tweet.read", "users.read", "bookmark.read", "offline.access"];

function base64Url(input: Buffer): string {
  return input.toString("base64url");
}

function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function waitForCallback(redirectUri: string, expectedState: string): Promise<string> {
  const redirect = new URL(redirectUri);
  const port = Number(redirect.port || (redirect.protocol === "https:" ? 443 : 80));
  const path = redirect.pathname;

  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      try {
        const incoming = new URL(request.url ?? "/", redirect.origin);
        if (incoming.pathname !== path) {
          response.writeHead(404).end("Not found");
          return;
        }

        const error = incoming.searchParams.get("error");
        if (error) throw new Error(`X authorization failed: ${error}`);

        const state = incoming.searchParams.get("state");
        const code = incoming.searchParams.get("code");
        if (!code || state !== expectedState) {
          throw new Error("OAuth callback state mismatch or missing code.");
        }

        response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Authorization complete. You can close this window.");
        server.close();
        resolve(code);
      } catch (error) {
        response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        response.end((error as Error).message);
        server.close();
        reject(error);
      }
    });

    server.once("error", reject);
    server.listen(port, redirect.hostname);
  });
}

export async function authorizeX(config: AppConfig): Promise<XTokenSet> {
  if (!config.xClientId) {
    throw new Error("X_CLIENT_ID is required. Add it to .env first.");
  }

  const { verifier, challenge } = createPkcePair();
  const state = base64Url(crypto.randomBytes(16));
  const url = new URL(AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.xClientId);
  url.searchParams.set("redirect_uri", config.xRedirectUri);
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  console.log(`Open this URL and approve access:\n\n${url.toString()}\n`);
  const code = await waitForCallback(config.xRedirectUri, state);

  return requestXToken(
    config,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.xRedirectUri,
      client_id: config.xClientId,
      code_verifier: verifier
    })
  );
}
