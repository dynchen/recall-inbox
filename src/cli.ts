#!/usr/bin/env node
import path from "node:path";
import { loadConfig } from "./env.js";
import { createGitHubSyncSource, createXSyncSource, runSyncSources } from "./jobs/sync.js";
import { groupItemsByCreatedDay, todayLocalDate, writeDailyMarkdown, writeDailyMarkdownFiles } from "./markdown.js";
import { JsonStore } from "./store/jsonStore.js";
import { authorizeX } from "./sources/x/oauth.js";
import { summarizeItems } from "./summarizer.js";
import type { AppConfig, SavedItem } from "./types.js";

async function authX(): Promise<void> {
  const config = loadConfig();
  const store = new JsonStore(config.dataDir);
  const token = await authorizeX(config);
  await store.writeXToken(token);
  console.log(`Saved X token to ${path.join(config.dataDir, "x-token.json")}`);
}

async function syncX(): Promise<void> {
  const config = loadConfig();
  const store = new JsonStore(config.dataDir);
  const result = await runSyncSources(store, [createXSyncSource(config, store)]);

  const outputPaths = await writeNewItems(config, result.newItems);

  console.log(`Fetched ${result.fetched} bookmarks.`);
  console.log(`New items: ${result.newItems.length}.`);
  console.log(`Wrote ${outputPaths.join(", ")}.`);
}

async function writeNewItems(config: AppConfig, newItems: SavedItem[]): Promise<string[]> {
  const groups =
    newItems.length > 0 ? groupItemsByCreatedDay(newItems) : new Map([[todayLocalDate(), []]]);
  const outputPaths: string[] = [];
  for (const [date, items] of [...groups.entries()].sort()) {
    const summary = await summarizeItems(config, items);
    outputPaths.push(await writeDailyMarkdown(config.outputDir, date, items, summary));
  }
  return outputPaths;
}

async function syncGitHub(): Promise<void> {
  const config = loadConfig();
  const store = new JsonStore(config.dataDir);
  const result = await runSyncSources(store, [createGitHubSyncSource(config)]);

  const outputPaths = await writeNewItems(config, result.newItems);

  console.log(`Fetched ${result.fetched} GitHub stars.`);
  console.log(`New items: ${result.newItems.length}.`);
  console.log(`Wrote ${outputPaths.join(", ")}.`);
}

async function exportMarkdown(): Promise<void> {
  const config = loadConfig();
  const store = new JsonStore(config.dataDir);
  const state = await store.readState();
  const outputPaths = await writeDailyMarkdownFiles(config.outputDir, state.items);

  console.log(`Exported ${state.items.length} stored items.`);
  console.log(`Wrote ${outputPaths.join(", ")}.`);
}

function printUsage(): void {
  console.log("Usage: node dist/src/cli.js <auth:x|sync:x|sync:github|export:md>");
}

async function main(): Promise<void> {
  const command = process.argv[2];

  if (command === "--help" || command === "help") {
    printUsage();
    return;
  }

  if (command === "auth:x") {
    await authX();
    return;
  }

  if (command === "sync:x") {
    await syncX();
    return;
  }

  if (command === "sync:github") {
    await syncGitHub();
    return;
  }

  if (command === "export:md") {
    await exportMarkdown();
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
