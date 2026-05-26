import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readReviewItems, updateReviewItem } from "../src/server.js";

async function makeDataDir(): Promise<string> {
  const dataDir = await mkdtemp(path.join(tmpdir(), "assistant-server-"));
  await writeFile(
    path.join(dataDir, "items.json"),
    JSON.stringify({
      items: [
        {
          id: "x:1",
          source: "x",
          sourceItemId: "1",
          url: "https://x.com/example/status/1",
          authorHandle: "example",
          text: "hello",
          discoveredAt: "2026-05-25T01:00:00.000Z",
          createdAt: "2026-05-24T01:00:00.000Z",
          tags: []
        }
      ]
    }),
    "utf8"
  );
  return dataDir;
}

test("readReviewItems returns normalized stored items", async () => {
  const items = await readReviewItems(await makeDataDir());

  assert.equal(items[0].id, "x:1");
  assert.equal(items[0].status, "inbox");
});

test("updateReviewItem persists review fields", async () => {
  const dataDir = await makeDataDir();
  const item = await updateReviewItem(dataDir, "x:1", {
    status: "action",
    tags: ["api", "read"],
    note: "follow up"
  });

  assert.ok(item);
  assert.equal(item.status, "action");
  assert.deepEqual(item.tags, ["api", "read"]);
  assert.equal(item.note, "follow up");

  const reread = await readReviewItems(dataDir);
  assert.equal(reread[0].status, "action");
  assert.deepEqual(reread[0].tags, ["api", "read"]);
  assert.equal(reread[0].note, "follow up");
});

test("updateReviewItem rejects invalid status", async () => {
  const dataDir = await makeDataDir();
  await assert.rejects(
    () => updateReviewItem(dataDir, "x:1", { status: "later" }),
    /Invalid status/
  );
});
