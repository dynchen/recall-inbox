import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createReviewServer, readReviewItems, updateReviewItem } from "../src/server.js";

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

test("local review server exposes runtime API endpoints", async () => {
  const dataDir = await makeDataDir();
  const server = createReviewServer({
    dataDir,
    staticDir: "dist/view",
    config: {
      dataDir,
      outputDir: "outputs/daily",
      summaryBaseUrl: "https://summary.example.com",
      summaryModel: "model",
      xRedirectUri: "http://127.0.0.1:17863/callback"
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.ok(address);
  const origin = `http://127.0.0.1:${(address as AddressInfo).port}`;

  try {
    const itemsResponse = await fetch(`${origin}/api/items`);
    const adminResponse = await fetch(`${origin}/api/admin/status`);
    const syncResponse = await fetch(`${origin}/api/sync?source=github`, { method: "POST" });

    assert.equal(itemsResponse.status, 200);
    assert.equal(adminResponse.status, 200);
    assert.equal(syncResponse.status, 400);
    assert.match(await syncResponse.text(), /GITHUB_TOKEN is not configured/);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
