import type { AppConfig, XTokenSet } from "../../types.js";

const TOKEN_URL = "https://api.x.com/2/oauth2/token";

function authHeader(config: AppConfig): Record<string, string> {
  if (!config.xClientId || !config.xClientSecret) return {};
  return { Authorization: `Basic ${btoa(`${config.xClientId}:${config.xClientSecret}`)}` };
}

function withExpiry(token: XTokenSet & { expires_in?: number }): XTokenSet {
  const expires_at = token.expires_in
    ? Date.now() + token.expires_in * 1000 - 60_000
    : token.expires_at;
  return {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at,
    scope: token.scope,
    token_type: token.token_type
  };
}

export async function requestXToken(
  config: AppConfig,
  body: URLSearchParams
): Promise<XTokenSet> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...authHeader(config)
    },
    body
  });

  if (!response.ok) {
    throw new Error(`X token request failed: ${response.status} ${await response.text()}`);
  }

  return withExpiry((await response.json()) as XTokenSet & { expires_in?: number });
}

export async function refreshXToken(config: AppConfig, token: XTokenSet): Promise<XTokenSet> {
  if (!token.refresh_token) return token;
  if (token.expires_at && token.expires_at > Date.now()) return token;
  if (!config.xClientId) throw new Error("X_CLIENT_ID is required to refresh the X token.");

  return requestXToken(
    config,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
      client_id: config.xClientId
    })
  );
}
