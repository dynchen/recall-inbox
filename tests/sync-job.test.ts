import assert from "node:assert/strict";
import test from "node:test";
import { runSyncSources } from "../src/jobs/sync.js";
import type { AssistantStore } from "../src/store/store.js";
import type { SavedItem, StoredState, XTokenSet } from "../src/types.js";

function item(id: string, text = id): SavedItem {
  return {
    id,
    source: id.startsWith("github:") ? "github" : "x",
    sourceItemId: id,
    url: `https://example.com/${id}`,
    text,
    discoveredAt: "2026-05-25T00:00:00.000Z",
    tags: []
  };
}

class MemoryStore implements AssistantStore {
  constructor(private state: StoredState) {}

  async readState(): Promise<StoredState> {
    return this.state;
  }

  async writeState(state: StoredState): Promise<void> {
    this.state = state;
  }

  async readXToken(): Promise<XTokenSet | null> {
    return null;
  }

  async writeXToken(): Promise<void> {}
}

test("runSyncSources merges fetched items and preserves local review fields", async () => {
  const existing = item("x:1", "old");
  existing.status = "keep";
  existing.tags = ["keep"];
  existing.note = "reviewed";
  const store = new MemoryStore({ items: [existing] });

  const result = await runSyncSources(store, [
    {
      name: "x",
      fetch: async (knownIds) => {
        assert.equal(knownIds.has("x:1"), true);
        return [item("x:1", "new"), item("github:repo", "repo")];
      }
    }
  ]);

  const state = await store.readState();
  assert.equal(result.fetched, 2);
  assert.equal(result.newItems.length, 1);
  assert.equal(result.sources.x.status, "ok");
  assert.equal(result.sources.x.fetched, 2);
  assert.equal(result.sources.x.newItems, 1);
  assert.equal(state.items.length, 2);
  assert.equal(state.items.find((savedItem) => savedItem.id === "x:1")?.text, "new");
  assert.equal(state.items.find((savedItem) => savedItem.id === "x:1")?.status, "keep");
  assert.deepEqual(state.items.find((savedItem) => savedItem.id === "x:1")?.tags, ["keep"]);
});

test("runSyncSources keeps syncing later sources when one source fails", async () => {
  const store = new MemoryStore({ items: [] });

  const result = await runSyncSources(store, [
    {
      name: "x",
      fetch: async () => {
        throw new Error("X API failed: 401 invalid token");
      }
    },
    {
      name: "github",
      fetch: async () => [item("github:repo", "repo")]
    }
  ]);

  const state = await store.readState();
  assert.equal(result.fetched, 1);
  assert.equal(result.newItems.length, 1);
  assert.equal(result.sources.x.status, "failed");
  assert.match(result.sources.x.error ?? "", /401 invalid token/);
  assert.equal(result.sources.github.status, "ok");
  assert.equal(result.sources.github.fetched, 1);
  assert.equal(state.items.length, 1);
});
