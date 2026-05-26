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

  const response = await handler(new Request("https://app.example.com/api/items"));

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
