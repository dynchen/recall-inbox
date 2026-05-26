import assert from "node:assert/strict";
import test from "node:test";
import { runCloudflareSync } from "../src/worker.js";
import type { D1Database } from "../src/store/d1Store.js";

class TestD1Statement {
  constructor(
    private readonly query: string,
    private readonly xTokenJson: string | null,
    private values: unknown[] = []
  ) {}

  bind(...values: unknown[]): TestD1Statement {
    return new TestD1Statement(this.query, this.xTokenJson, values);
  }

  async all<T = unknown>(): Promise<{ results?: T[] }> {
    return { results: [] };
  }

  async first<T = unknown>(): Promise<T | null> {
    if (this.query.includes("source_tokens") && this.values[0] === "x" && this.xTokenJson) {
      return { token_json: this.xTokenJson } as T;
    }
    return null;
  }

  async run(): Promise<unknown> {
    return {};
  }
}

class TestD1Database implements D1Database {
  constructor(private readonly xTokenJson: string | null = null) {}

  prepare(query: string): TestD1Statement {
    return new TestD1Statement(query, this.xTokenJson);
  }

  async batch<T = unknown>(): Promise<T[]> {
    return [];
  }
}

test("cloudflare sync skips x source when x is not configured", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify([
        {
          starred_at: "2026-05-26T00:00:00Z",
          repo: {
            full_name: "owner/repo",
            html_url: "https://github.com/owner/repo",
            description: "Repository",
            language: "TypeScript",
            stargazers_count: 10,
            topics: [],
            owner: { login: "owner" }
          }
        }
      ]),
      { headers: { "Content-Type": "application/json" } }
    );

  try {
    const result = await runCloudflareSync({
      DB: new TestD1Database(),
      X_CLIENT_ID: "",
      GITHUB_TOKEN: "github-token"
    });

    assert.deepEqual(Object.keys(result.sources), ["github"]);
    assert.equal(result.sources.github.status, "ok");
    assert.equal(result.newItems, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cloudflare sync can target github without calling x", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.match(String(input), /api\.github\.com/);
    return new Response(
      JSON.stringify([
        {
          starred_at: "2026-05-26T00:00:00Z",
          repo: {
            full_name: "owner/repo",
            html_url: "https://github.com/owner/repo",
            description: "Repository",
            language: "TypeScript",
            stargazers_count: 10,
            topics: [],
            owner: { login: "owner" }
          }
        }
      ]),
      { headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const result = await runCloudflareSync(
      {
        DB: new TestD1Database(
          JSON.stringify({
            access_token: "x-token",
            refresh_token: "x-refresh",
            expires_at: Date.now() + 60_000
          })
        ),
        X_CLIENT_ID: "x-client",
        GITHUB_TOKEN: "github-token"
      },
      { source: "github", maxPages: 1 }
    );

    assert.deepEqual(Object.keys(result.sources), ["github"]);
    assert.equal(result.sources.github.status, "ok");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cloudflare full scan continues past known github pages", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  globalThis.fetch = async (input) => {
    requestedUrls.push(String(input));
    const page = requestedUrls.length;
    return new Response(
      JSON.stringify([
        {
          starred_at: `2026-05-${20 - page}T00:00:00Z`,
          repo: {
            full_name: page === 1 ? "owner/known-repo" : "owner/older-repo",
            html_url: "https://github.com/owner/repo",
            description: "Repository",
            language: "TypeScript",
            stargazers_count: 10,
            topics: [],
            owner: { login: "owner" }
          }
        }
      ]),
      {
        headers: page === 1
          ? {
              "Content-Type": "application/json",
              Link: '<https://api.github.com/user/starred?page=2>; rel="next"'
            }
          : { "Content-Type": "application/json" }
      }
    );
  };

  try {
    const result = await runCloudflareSync(
      { DB: new TestD1Database(), GITHUB_TOKEN: "github-token" },
      { source: "github", maxPages: 10, fullScan: true }
    );

    assert.equal(requestedUrls.length, 2);
    assert.equal(result.sources.github.status, "ok");
    assert.equal(result.sources.github.fetched, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
