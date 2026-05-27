import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { renderDailyMarkdown } from "../src/markdown.js";
import { writeDailyMarkdownFiles } from "../src/markdownFiles.js";
import type { SavedItem } from "../src/types.js";

test("renders an empty daily markdown file", () => {
  const markdown = renderDailyMarkdown("2026-05-25", []);

  assert.match(markdown, /# Daily Saved Items - 2026-05-25/);
  assert.match(markdown, /No new saved items today\./);
});

test("renders saved items with source, link, quote, and inbox status", () => {
  const item: SavedItem = {
    id: "x:1",
    source: "x",
    sourceItemId: "1",
    url: "https://x.com/example/status/1",
    authorHandle: "example",
    text: "Useful note\nsecond line",
    discoveredAt: "2026-05-25T01:00:00.000Z",
    createdAt: "2026-05-24T01:00:00.000Z",
    tags: []
  };

  const markdown = renderDailyMarkdown("2026-05-25", [item], "## Themes\n- API");

  assert.match(markdown, /## Summary/);
  assert.match(markdown, /@example/);
  assert.match(markdown, /Link: https:\/\/x\.com\/example\/status\/1/);
  assert.match(markdown, /> Useful note\n  second line/);
  assert.match(markdown, /Discovered: 2026-05-25T01:00:00.000Z/);
  assert.match(markdown, /Status: inbox/);
});

test("renders saved items as a flat list", () => {
  const items: SavedItem[] = [
    {
      id: "x:1",
      source: "x",
      sourceItemId: "1",
      url: "https://x.com/example/status/1",
      authorHandle: "newer",
      text: "newer item",
      discoveredAt: "2026-05-25T01:00:00.000Z",
      tags: []
    },
    {
      id: "x:2",
      source: "x",
      sourceItemId: "2",
      url: "https://x.com/example/status/2",
      authorHandle: "older",
      text: "older item",
      discoveredAt: "2026-05-24T01:00:00.000Z",
      tags: []
    }
  ];

  const markdown = renderDailyMarkdown("2026-05-25", items);

  assert.doesNotMatch(markdown, /### 2026-05-25/);
  assert.doesNotMatch(markdown, /### 2026-05-24/);
  assert.match(markdown, /### @newer/);
  assert.match(markdown, /### @older/);
});

test("writes separate markdown files by createdAt day", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "assistant-markdown-"));
  const items: SavedItem[] = [
    {
      id: "x:1",
      source: "x",
      sourceItemId: "1",
      url: "https://x.com/example/status/1",
      authorHandle: "newer",
      text: "newer item",
      discoveredAt: "2026-05-25T01:00:00.000Z",
      createdAt: "2026-05-23T01:00:00.000Z",
      tags: []
    },
    {
      id: "x:2",
      source: "x",
      sourceItemId: "2",
      url: "https://x.com/example/status/2",
      authorHandle: "older",
      text: "older item",
      discoveredAt: "2026-05-24T01:00:00.000Z",
      createdAt: "2026-05-22T01:00:00.000Z",
      tags: []
    }
  ];

  const paths = await writeDailyMarkdownFiles(outputDir, items);

  assert.deepEqual(
    paths.map((filePath) => path.basename(filePath)).sort(),
    ["2026-05-22.md", "2026-05-23.md"]
  );
  assert.match(await readFile(path.join(outputDir, "2026-05-23.md"), "utf8"), /@newer/);
  assert.doesNotMatch(await readFile(path.join(outputDir, "2026-05-23.md"), "utf8"), /@older/);
  assert.match(await readFile(path.join(outputDir, "2026-05-22.md"), "utf8"), /@older/);
});
