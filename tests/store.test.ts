import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { JsonStore, mergeItems } from "../src/store/jsonStore.js";
import type { SavedItem } from "../src/types.js";

function item(id: string, discoveredAt: string, text = id): SavedItem {
  return {
    id,
    source: "x",
    sourceItemId: id.replace("x:", ""),
    url: `https://x.com/i/status/${id}`,
    text,
    discoveredAt,
    tags: []
  };
}

test("mergeItems deduplicates by normalized id and keeps incoming updates", () => {
  const merged = mergeItems(
    [item("x:1", "2026-05-24T00:00:00.000Z", "old")],
    [
      item("x:1", "2026-05-25T00:00:00.000Z", "new"),
      item("x:2", "2026-05-23T00:00:00.000Z")
    ]
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, "x:1");
  assert.equal(merged[0].text, "new");
});

test("mergeItems preserves local review fields on existing items", () => {
  const existing = item("x:1", "2026-05-24T00:00:00.000Z", "old");
  existing.status = "keep";
  existing.tags = ["workflow"];
  existing.note = "reviewed";

  const merged = mergeItems([existing], [item("x:1", "2026-05-25T00:00:00.000Z", "new")]);

  assert.equal(merged[0].text, "new");
  assert.equal(merged[0].status, "keep");
  assert.deepEqual(merged[0].tags, ["workflow"]);
  assert.equal(merged[0].note, "reviewed");
});

test("JsonStore migrates legacy bookmarkedAt to discoveredAt", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "assistant-store-"));
  await writeFile(
    path.join(dataDir, "items.json"),
    JSON.stringify({
      items: [
        {
          id: "x:1",
          source: "x",
          sourceItemId: "1",
          url: "https://x.com/i/status/1",
          text: "legacy",
          bookmarkedAt: "2026-05-25T01:00:00.000Z",
          tags: []
        }
      ]
    }),
    "utf8"
  );

  const state = await new JsonStore(dataDir).readState();

  assert.equal(state.items[0].discoveredAt, "2026-05-25T01:00:00.000Z");
  assert.equal("bookmarkedAt" in state.items[0], false);
});

test("JsonStore normalizes local review fields", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "assistant-store-"));
  await writeFile(
    path.join(dataDir, "items.json"),
    JSON.stringify({
      items: [
        {
          id: "x:1",
          source: "x",
          sourceItemId: "1",
          url: "https://x.com/i/status/1",
          text: "review",
          discoveredAt: "2026-05-25T01:00:00.000Z"
        }
      ]
    }),
    "utf8"
  );

  const state = await new JsonStore(dataDir).readState();

  assert.equal(state.items[0].status, "inbox");
  assert.equal(state.items[0].note, "");
  assert.deepEqual(state.items[0].tags, []);
});

test("JsonStore normalizes legacy review statuses to inbox", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "assistant-store-"));
  await writeFile(
    path.join(dataDir, "items.json"),
    JSON.stringify({
      items: [
        { ...item("x:1", "2026-05-25T01:00:00.000Z"), status: "todo" },
        { ...item("x:2", "2026-05-25T02:00:00.000Z"), status: "done" },
        { ...item("x:3", "2026-05-25T03:00:00.000Z"), status: "ignored" }
      ]
    }),
    "utf8"
  );

  const state = await new JsonStore(dataDir).readState();

  assert.deepEqual(state.items.map((savedItem) => savedItem.status), ["inbox", "inbox", "inbox"]);
});
