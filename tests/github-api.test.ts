import assert from "node:assert/strict";
import test from "node:test";
import { fetchGitHubStars } from "../src/sources/github/api.js";
import type { SavedItem } from "../src/types.js";

test("fetchGitHubStars maps starred repositories and stops on known page", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  const requestHeaders: HeadersInit[] = [];
  const pages = [
    [
      {
        starred_at: "2026-05-20T01:00:00Z",
        repo: {
          full_name: "owner/new-repo",
          html_url: "https://github.com/owner/new-repo",
          description: "Useful project",
          language: "TypeScript",
          stargazers_count: 123,
          forks_count: 7,
          open_issues_count: 3,
          archived: false,
          fork: false,
          homepage: "https://example.com",
          default_branch: "main",
          updated_at: "2026-05-21T01:00:00Z",
          pushed_at: "2026-05-22T01:00:00Z",
          license: { spdx_id: "MIT", name: "MIT License" },
          topics: ["cli", "ai"],
          owner: { login: "owner" }
        }
      }
    ],
    [
      {
        starred_at: "2026-05-19T01:00:00Z",
        repo: {
          full_name: "owner/known-repo",
          html_url: "https://github.com/owner/known-repo",
          description: null,
          language: null,
          stargazers_count: 5,
          topics: [],
          owner: { login: "owner" }
        }
      }
    ],
    [
      {
        starred_at: "2026-05-18T01:00:00Z",
        repo: {
          full_name: "owner/not-fetched",
          html_url: "https://github.com/owner/not-fetched",
          description: null,
          language: null,
          stargazers_count: 1,
          topics: [],
          owner: { login: "owner" }
        }
      }
    ]
  ];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrls.push(String(input));
    requestHeaders.push(init?.headers ?? {});
    const page = pages[requestedUrls.length - 1];
    const headers: Record<string, string> =
      requestedUrls.length < 3
        ? { Link: '<https://api.github.com/user/starred?page=2>; rel="next"' }
        : {};
    return new Response(JSON.stringify(page), { status: 200, headers });
  }) as typeof fetch;

  try {
    const items = await fetchGitHubStars("token", {
      knownItemIds: new Set(["github:owner/known-repo"])
    });

    assert.deepEqual(
      (items as SavedItem[]).map((item) => item.id),
      ["github:owner/new-repo", "github:owner/known-repo"]
    );
    assert.equal(items[0].source, "github");
    assert.equal(items[0].sourceItemId, "owner/new-repo");
    assert.equal(items[0].createdAt, "2026-05-20T01:00:00Z");
    assert.match(items[0].text, /owner\/new-repo/);
    assert.match(items[0].text, /Language: TypeScript/);
    assert.deepEqual(items[0].metadata, {
      github: {
        license: "MIT",
        forks: 7,
        openIssues: 3,
        archived: false,
        fork: false,
        homepage: "https://example.com",
        defaultBranch: "main",
        updatedAt: "2026-05-21T01:00:00Z",
        pushedAt: "2026-05-22T01:00:00Z"
      }
    });
    assert.deepEqual(items[0].tags, []);
    assert.equal(requestedUrls.length, 2);
    assert.match(JSON.stringify(requestHeaders[0]), /application\/vnd\.github\.star\+json/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchGitHubStars respects maxPages", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    return new Response(
      JSON.stringify([
        {
          starred_at: "2026-05-20T01:00:00Z",
          repo: {
            full_name: `owner/repo-${requestedUrls.length}`,
            html_url: `https://github.com/owner/repo-${requestedUrls.length}`,
            description: null,
            language: null,
            stargazers_count: 1,
            topics: [],
            owner: { login: "owner" }
          }
        }
      ]),
      {
        status: 200,
        headers: { Link: '<https://api.github.com/user/starred?page=2>; rel="next"' }
      }
    );
  }) as typeof fetch;

  try {
    const items = await fetchGitHubStars("token", { maxPages: 2 });

    assert.deepEqual(
      items.map((item) => item.id),
      ["github:owner/repo-1", "github:owner/repo-2"]
    );
    assert.equal(requestedUrls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchGitHubStars can continue past known pages for backfill", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    const page = requestedUrls.length;
    return new Response(
      JSON.stringify([
        {
          starred_at: `2026-05-${20 - page}T01:00:00Z`,
          repo: {
            full_name: page === 1 ? "owner/known-repo" : "owner/older-repo",
            html_url: "https://github.com/owner/repo",
            description: null,
            language: null,
            stargazers_count: 1,
            topics: [],
            owner: { login: "owner" }
          }
        }
      ]),
      {
        status: 200,
        headers: page === 1 ? { Link: '<https://api.github.com/user/starred?page=2>; rel="next"' } : {}
      }
    );
  }) as typeof fetch;

  try {
    const items = await fetchGitHubStars("token", {
      knownItemIds: new Set(["github:owner/known-repo"]),
      stopOnKnownPage: false
    });

    assert.deepEqual(
      items.map((item) => item.id),
      ["github:owner/known-repo", "github:owner/older-repo"]
    );
    assert.equal(requestedUrls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
