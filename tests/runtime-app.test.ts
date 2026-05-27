import assert from "node:assert/strict";
import test from "node:test";
import { createAppHandler } from "../src/runtime/app.js";
import type { StoredState, XTokenSet } from "../src/types.js";
import type { OAuthStateRecord, RuntimeStore } from "../src/runtime/store.js";

class TestRuntimeStore implements RuntimeStore {
  constructor(private state: StoredState = { items: [] }) {}

  async readState(): Promise<StoredState> {
    return this.state;
  }

  async writeState(state: StoredState): Promise<void> {
    this.state = state;
  }

  async readXToken(): Promise<XTokenSet | null> {
    return null;
  }

  async writeXToken(_token: XTokenSet): Promise<void> {}

  async writeOAuthState(_state: OAuthStateRecord): Promise<void> {}

  async readOAuthState(_state: string): Promise<OAuthStateRecord | null> {
    return null;
  }

  async deleteOAuthState(_state: string): Promise<void> {}
}

test("runtime app handler serves review items from an injected store", async () => {
  const handler = createAppHandler({
    createStore: () =>
      new TestRuntimeStore({
        items: [
          {
            id: "github:owner/repo",
            source: "github",
            sourceItemId: "owner/repo",
            url: "https://github.com/owner/repo",
            text: "Repository",
            discoveredAt: "2026-05-26T00:00:00.000Z",
            tags: ["github"],
            status: "inbox",
            note: ""
          }
        ]
      }),
    config: {
      xRedirectUri: "https://app.example.com/api/auth/x/callback",
      dataDir: ".data",
      outputDir: "outputs/daily",
      summaryModel: "model",
      summaryBaseUrl: "https://summary.example.com"
    },
    adminSecret: "secret"
  });

  const response = await handler(new Request("https://app.example.com/api/items", {
    headers: { Authorization: "Bearer secret" }
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    items: [
      {
        id: "github:owner/repo",
        source: "github",
        sourceItemId: "owner/repo",
        url: "https://github.com/owner/repo",
        text: "Repository",
        discoveredAt: "2026-05-26T00:00:00.000Z",
        tags: ["github"],
        status: "inbox",
        note: ""
      }
    ]
  });
});

test("runtime app handler protects real item reads and writes with admin secret", async () => {
  const handler = createAppHandler({
    createStore: () =>
      new TestRuntimeStore({
        items: [
          {
            id: "github:owner/repo",
            source: "github",
            sourceItemId: "owner/repo",
            url: "https://github.com/owner/repo",
            text: "Repository",
            discoveredAt: "2026-05-26T00:00:00.000Z",
            tags: ["github"],
            status: "inbox",
            note: ""
          }
        ]
      }),
    config: {
      xRedirectUri: "https://app.example.com/api/auth/x/callback",
      dataDir: ".data",
      outputDir: "outputs/daily",
      summaryModel: "model",
      summaryBaseUrl: "https://summary.example.com"
    },
    adminSecret: "secret"
  });

  const readResponse = await handler(new Request("https://app.example.com/api/items"));
  const writeResponse = await handler(new Request("https://app.example.com/api/items/github%3Aowner%2Frepo", {
    method: "PATCH",
    body: JSON.stringify({ status: "keep" })
  }));
  const authorizedWriteResponse = await handler(new Request("https://app.example.com/api/items/github%3Aowner%2Frepo", {
    method: "PATCH",
    headers: { Authorization: "Bearer secret" },
    body: JSON.stringify({ status: "keep" })
  }));

  assert.equal(readResponse.status, 401);
  assert.equal(writeResponse.status, 401);
  assert.equal(authorizedWriteResponse.status, 200);
});

test("runtime app handler exports stored items as daily markdown files", async () => {
  const handler = createAppHandler({
    createStore: () =>
      new TestRuntimeStore({
        items: [
          {
            id: "github:owner/repo",
            source: "github",
            sourceItemId: "owner/repo",
            url: "https://github.com/owner/repo",
            authorName: "owner/repo",
            text: "Repository",
            discoveredAt: "2026-05-26T00:00:00.000Z",
            createdAt: "2026-05-26T00:00:00.000Z",
            tags: ["github", "try"],
            status: "action",
            note: "Ship it\nsoon"
          }
        ]
      }),
    config: {
      xRedirectUri: "https://app.example.com/api/auth/x/callback",
      dataDir: ".data",
      outputDir: "outputs/daily",
      summaryModel: "model",
      summaryBaseUrl: "https://summary.example.com"
    },
    adminSecret: "secret"
  });

  const lockedResponse = await handler(new Request("https://app.example.com/api/export/markdown"));
  const response = await handler(new Request("https://app.example.com/api/export/markdown", {
    headers: { Authorization: "Bearer secret" }
  }));

  assert.equal(lockedResponse.status, 401);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    files: [
      {
        filename: "2026-05-26.md",
        content: [
          "# Daily Saved Items - 2026-05-26",
          "",
          "## New Items",
          "",
          "### owner/repo",
          "",
          "- Source: github",
          "- Link: https://github.com/owner/repo",
          "- Created: 2026-05-26T00:00:00.000Z",
          "- Discovered: 2026-05-26T00:00:00.000Z",
          "",
          "> Repository",
          "",
          "- Status: action",
          "- Tags: github, try",
          "- Note: Ship it\n  soon",
          ""
        ].join("\n")
      }
    ]
  });
});

test("runtime app handler serves non-persistent demo items", async () => {
  const handler = createAppHandler({
    createStore: () => new TestRuntimeStore(),
    config: {
      xRedirectUri: "https://app.example.com/api/auth/x/callback",
      dataDir: ".data",
      outputDir: "outputs/daily",
      summaryModel: "model",
      summaryBaseUrl: "https://summary.example.com"
    },
    demoItems: [
      {
        id: "github:owner/repo",
        source: "github",
        sourceItemId: "owner/repo",
        url: "https://github.com/owner/repo",
        text: "Repository",
        discoveredAt: "2026-05-26T00:00:00.000Z",
        tags: ["github"],
        status: "inbox",
        note: ""
      }
    ]
  });

  const patchResponse = await handler(new Request("https://app.example.com/api/items/github%3Aowner%2Frepo", {
    method: "PATCH",
    body: JSON.stringify({ status: "keep", note: "Read later" })
  }));
  const listResponse = await handler(new Request("https://app.example.com/api/items"));

  assert.equal(patchResponse.status, 200);
  assert.deepEqual(await patchResponse.json(), {
    item: {
      id: "github:owner/repo",
      source: "github",
      sourceItemId: "owner/repo",
      url: "https://github.com/owner/repo",
      text: "Repository",
      discoveredAt: "2026-05-26T00:00:00.000Z",
      tags: ["github"],
      status: "keep",
      note: "Read later"
    }
  });
  assert.deepEqual(await listResponse.json(), {
    demo: true,
    items: [
      {
        id: "github:owner/repo",
        source: "github",
        sourceItemId: "owner/repo",
        url: "https://github.com/owner/repo",
        text: "Repository",
        discoveredAt: "2026-05-26T00:00:00.000Z",
        tags: ["github"],
        status: "inbox",
        note: ""
      }
    ]
  });
});
