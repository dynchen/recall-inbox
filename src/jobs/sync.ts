import type { AppConfig, SavedItem } from "../types.js";
import { fetchGitHubStars } from "../sources/github/api.js";
import { fetchXBookmarks, getValidXToken, getXUserId } from "../sources/x/api.js";
import type { AssistantStore } from "../store/store.js";
import { mergeItems } from "../store/store.js";

export interface SyncSource {
  name: string;
  fetch(knownItemIds: Set<string>): Promise<SavedItem[]>;
}

export interface CreateSyncSourceOptions {
  maxPages?: number;
  fullScan?: boolean;
}

export interface SyncSourceResult {
  status: "ok" | "failed";
  fetched: number;
  newItems: number;
  error?: string;
}

export interface SyncResult {
  fetched: number;
  newItems: SavedItem[];
  items: SavedItem[];
  sources: Record<string, SyncSourceResult>;
}

export async function runSyncSources(store: AssistantStore, sources: SyncSource[]): Promise<SyncResult> {
  let state = await store.readState();
  const allFetched: SavedItem[] = [];
  const allNew: SavedItem[] = [];
  const sourceResults: Record<string, SyncSourceResult> = {};

  for (const source of sources) {
    try {
      const existingIds = new Set(state.items.map((item) => item.id));
      const fetchedItems = await source.fetch(existingIds);
      const newItems = fetchedItems.filter((item) => !existingIds.has(item.id));
      allFetched.push(...fetchedItems);
      allNew.push(...newItems);
      state = { items: mergeItems(state.items, fetchedItems) };
      sourceResults[source.name] = {
        status: "ok",
        fetched: fetchedItems.length,
        newItems: newItems.length
      };
    } catch (error) {
      sourceResults[source.name] = {
        status: "failed",
        fetched: 0,
        newItems: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  await store.writeState(state);
  return {
    fetched: allFetched.length,
    newItems: allNew,
    items: state.items,
    sources: sourceResults
  };
}

export function createXSyncSource(
  config: AppConfig,
  store: AssistantStore,
  options: CreateSyncSourceOptions = {}
): SyncSource {
  return {
    name: "x",
    fetch: async (knownItemIds) => {
      const token = await getValidXToken(config, store);
      const userId = await getXUserId(token);
      return fetchXBookmarks(token, userId, {
        knownItemIds: knownItemIds.size > 0 ? knownItemIds : undefined,
        maxPages: options.maxPages
      });
    }
  };
}

export function createGitHubSyncSource(
  config: AppConfig,
  options: CreateSyncSourceOptions = {}
): SyncSource {
  if (!config.githubToken) {
    throw new Error("GITHUB_TOKEN is required. Add it to .env first.");
  }

  return {
    name: "github",
    fetch: (knownItemIds) =>
      fetchGitHubStars(config.githubToken ?? "", {
        knownItemIds: knownItemIds.size > 0 ? knownItemIds : undefined,
        maxPages: options.maxPages,
        stopOnKnownPage: !options.fullScan
      })
  };
}
