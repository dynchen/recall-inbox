import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/worker.js";
import type { D1Database } from "../src/store/d1Store.js";

interface OAuthStateRow {
  state: string;
  code_verifier: string;
  redirect_uri: string;
  expires_at: string;
}

class TestD1Statement {
  constructor(
    private readonly db: TestD1Database,
    private readonly query: string,
    private readonly values: unknown[] = []
  ) {}

  bind(...values: unknown[]): TestD1Statement {
    return new TestD1Statement(this.db, this.query, values);
  }

  async all<T = unknown>(): Promise<{ results?: T[] }> {
    return { results: [] };
  }

  async first<T = unknown>(): Promise<T | null> {
    if (this.query.includes("oauth_states")) {
      const row = this.db.oauthStates.get(String(this.values[0]));
      return (row ?? null) as T | null;
    }
    if (this.query.includes("source_tokens")) {
      const tokenJson = this.db.sourceTokens.get(String(this.values[0]));
      return tokenJson ? ({ token_json: tokenJson } as T) : null;
    }
    return null;
  }

  async run(): Promise<unknown> {
    if (this.query.includes("INSERT INTO oauth_states")) {
      this.db.oauthStates.set(String(this.values[0]), {
        state: String(this.values[0]),
        code_verifier: String(this.values[1]),
        redirect_uri: String(this.values[2]),
        expires_at: String(this.values[3])
      });
    }
    if (this.query.includes("DELETE FROM oauth_states")) {
      this.db.oauthStates.delete(String(this.values[0]));
    }
    if (this.query.includes("INSERT INTO source_tokens")) {
      this.db.sourceTokens.set(String(this.values[0]), String(this.values[1]));
    }
    return {};
  }
}

class TestD1Database implements D1Database {
  oauthStates = new Map<string, OAuthStateRow>();
  sourceTokens = new Map<string, string>();

  prepare(query: string): TestD1Statement {
    return new TestD1Statement(this, query);
  }

  async batch<T = unknown>(): Promise<T[]> {
    return [];
  }
}

test("worker x auth start stores pkce state and redirects to x", async () => {
  const db = new TestD1Database();
  const response = await worker.fetch(
    new Request("https://app.example.com/api/auth/x/start?token=secret"),
    { DB: db, ADMIN_SECRET: "secret", X_CLIENT_ID: "client-id" }
  );

  assert.equal(response.status, 302);
  const location = response.headers.get("location");
  assert.ok(location);
  const authUrl = new URL(location);
  assert.equal(authUrl.origin, "https://x.com");
  assert.equal(authUrl.searchParams.get("client_id"), "client-id");
  assert.equal(authUrl.searchParams.get("redirect_uri"), "https://app.example.com/api/auth/x/callback");
  assert.equal(authUrl.searchParams.get("code_challenge_method"), "S256");
  const state = authUrl.searchParams.get("state");
  assert.ok(state);
  assert.ok(db.oauthStates.has(state));
});

test("worker x auth start can return authorization url for protected UI", async () => {
  const db = new TestD1Database();
  const response = await worker.fetch(
    new Request("https://app.example.com/api/auth/x/start", {
      method: "POST",
      headers: { Authorization: "Bearer secret" }
    }),
    { DB: db, ADMIN_SECRET: "secret", X_CLIENT_ID: "client-id" }
  );

  assert.equal(response.status, 200);
  const body = await response.json() as { authorizationUrl?: string };
  assert.ok(body.authorizationUrl);
  const authUrl = new URL(body.authorizationUrl);
  assert.equal(authUrl.origin, "https://x.com");
  const state = authUrl.searchParams.get("state");
  assert.ok(state);
  assert.ok(db.oauthStates.has(state));
});

test("worker x auth start rejects missing admin secret", async () => {
  const response = await worker.fetch(
    new Request("https://app.example.com/api/auth/x/start", { method: "POST" }),
    { DB: new TestD1Database(), ADMIN_SECRET: "secret", X_CLIENT_ID: "client-id" }
  );

  assert.equal(response.status, 401);
});

test("worker x auth callback exchanges code, stores token, and redirects home", async () => {
  const db = new TestD1Database();
  db.oauthStates.set("state-1", {
    state: "state-1",
    code_verifier: "verifier-1",
    redirect_uri: "https://app.example.com/api/auth/x/callback",
    expires_at: new Date(Date.now() + 60_000).toISOString()
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    assert.equal(init?.method, "POST");
    const body = init?.body as URLSearchParams;
    assert.equal(body.get("grant_type"), "authorization_code");
    assert.equal(body.get("code"), "code-1");
    assert.equal(body.get("code_verifier"), "verifier-1");
    return new Response(
      JSON.stringify({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 7200,
        token_type: "bearer"
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const response = await worker.fetch(
      new Request("https://app.example.com/api/auth/x/callback?state=state-1&code=code-1"),
      { DB: db, ADMIN_SECRET: "secret", X_CLIENT_ID: "client-id" }
    );

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://app.example.com/");
    assert.equal(db.oauthStates.has("state-1"), false);
    const token = JSON.parse(db.sourceTokens.get("x") ?? "{}") as { access_token?: string };
    assert.equal(token.access_token, "access-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("worker manual sync requires admin secret and a ready source", async () => {
  const db = new TestD1Database();
  const unauthorized = await worker.fetch(
    new Request("https://app.example.com/api/sync", { method: "POST" }),
    { DB: db, ADMIN_SECRET: "secret" }
  );
  assert.equal(unauthorized.status, 401);

  const notReady = await worker.fetch(
    new Request("https://app.example.com/api/sync", {
      method: "POST",
      headers: { Authorization: "Bearer secret" }
    }),
    { DB: db, ADMIN_SECRET: "secret" }
  );

  assert.equal(notReady.status, 400);
  assert.deepEqual(await notReady.json(), {
    error: "No sources are ready to sync.",
    sources: {
      x: {
        configured: false,
        authorized: false,
        syncEnabled: false,
        reason: "X_CLIENT_ID is not configured."
      },
      github: {
        configured: false,
        authorized: false,
        syncEnabled: false,
        reason: "GITHUB_TOKEN is not configured."
      }
    }
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" } });
  try {
    const response = await worker.fetch(
      new Request("https://app.example.com/api/sync?source=github", {
        method: "POST",
        headers: { Authorization: "Bearer secret" }
      }),
      { DB: db, ADMIN_SECRET: "secret", GITHUB_TOKEN: "github-token" }
    );

    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("worker manual sync rejects invalid source", async () => {
  const response = await worker.fetch(
    new Request("https://app.example.com/api/sync?source=weibo", {
      method: "POST",
      headers: { Authorization: "Bearer secret" }
    }),
    { DB: new TestD1Database(), ADMIN_SECRET: "secret" }
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid sync source." });
});

test("worker admin status reports source readiness", async () => {
  const db = new TestD1Database();
  const unauthenticated = await worker.fetch(
    new Request("https://app.example.com/api/admin/status"),
    { DB: db, ADMIN_SECRET: "secret" }
  );
  assert.equal(unauthenticated.status, 401);

  const missing = await worker.fetch(
    new Request("https://app.example.com/api/admin/status", {
      headers: { Authorization: "Bearer secret" }
    }),
    { DB: db, ADMIN_SECRET: "secret", X_CLIENT_ID: "client-id" }
  );
  assert.deepEqual(await missing.json(), {
    sources: {
      x: {
        configured: true,
        authorized: false,
        syncEnabled: false,
        reason: "Authorize X before syncing."
      },
      github: {
        configured: false,
        authorized: false,
        syncEnabled: false,
        reason: "GITHUB_TOKEN is not configured."
      }
    }
  });

  db.sourceTokens.set("x", JSON.stringify({ access_token: "x-token" }));
  const ready = await worker.fetch(
    new Request("https://app.example.com/api/admin/status", {
      headers: { Authorization: "Bearer secret" }
    }),
    { DB: db, ADMIN_SECRET: "secret", X_CLIENT_ID: "client-id", GITHUB_TOKEN: "github-token" }
  );
  assert.deepEqual(await ready.json(), {
    sources: {
      x: {
        configured: true,
        authorized: true,
        syncEnabled: true
      },
      github: {
        configured: true,
        authorized: true,
        syncEnabled: true
      }
    }
  });
});
