import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "../src/env.js";
import { summarizeItems } from "../src/summarizer.js";
import type { SavedItem } from "../src/types.js";

function item(): SavedItem {
  return {
    id: "x:1",
    source: "x",
    sourceItemId: "1",
    url: "https://x.com/example/status/1",
    text: "Saved post",
    discoveredAt: "2026-05-26T00:00:00.000Z",
    tags: []
  };
}

test("loadConfig reads provider-neutral summary settings", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "recall-inbox-"));
  await writeFile(
    path.join(cwd, ".env"),
    [
      "SUMMARY_API_KEY=summary-key",
      "SUMMARY_MODEL=summary-model",
      "SUMMARY_BASE_URL=https://summary.example.com/v1/responses"
    ].join("\n")
  );

  const config = loadConfig(cwd);

  assert.equal(config.summaryApiKey, "summary-key");
  assert.equal(config.summaryModel, "summary-model");
  assert.equal(config.summaryBaseUrl, "https://summary.example.com/v1/responses");
});

test("loadConfig reads local admin secret", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "recall-inbox-"));
  await writeFile(path.join(cwd, ".env"), "ADMIN_SECRET=local-secret\n");

  const config = loadConfig(cwd);

  assert.equal(config.adminSecret, "local-secret");
});

test("loadConfig ignores provider-specific legacy summary settings", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "recall-inbox-"));
  await writeFile(
    path.join(cwd, ".env"),
    ["OPENAI_API_KEY=openai-key", "OPENAI_MODEL=openai-model"].join("\n")
  );

  const config = loadConfig(cwd);

  assert.equal(config.summaryApiKey, undefined);
  assert.equal(config.summaryModel, "gpt-4.1-mini");
});

test("summarizeItems uses provider-neutral summary endpoint", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "https://summary.example.com/v1/responses");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer summary-key");
    const body = JSON.parse(String(init?.body)) as { model?: string };
    assert.equal(body.model, "summary-model");
    return new Response(JSON.stringify({ output_text: "summary" }), {
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const summary = await summarizeItems(
      {
        xRedirectUri: "http://127.0.0.1:17863/callback",
        dataDir: ".data",
        outputDir: "outputs/daily",
        summaryApiKey: "summary-key",
        summaryModel: "summary-model",
        summaryBaseUrl: "https://summary.example.com/v1/responses"
      },
      [item()]
    );

    assert.equal(summary, "summary");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
