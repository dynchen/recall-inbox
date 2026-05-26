import type { SavedItem, SavedItemStatus, StoredState, XTokenSet } from "../types.js";

export interface AssistantStore {
  readState(): Promise<StoredState>;
  writeState(state: StoredState): Promise<void>;
  readXToken(): Promise<XTokenSet | null>;
  writeXToken(token: XTokenSet): Promise<void>;
}

type LegacySavedItem = SavedItem & { bookmarkedAt?: string; discoveredAt?: string };
const VALID_STATUSES = new Set<SavedItemStatus>(["inbox", "keep", "action", "dismiss"]);

export function normalizeItem(item: LegacySavedItem): SavedItem {
  const { bookmarkedAt: _bookmarkedAt, ...rest } = item;
  return {
    ...rest,
    discoveredAt: item.discoveredAt ?? _bookmarkedAt ?? new Date(0).toISOString(),
    tags: Array.isArray(item.tags) ? item.tags : [],
    status: item.status && VALID_STATUSES.has(item.status) ? item.status : "inbox",
    note: item.note ?? ""
  };
}

export function normalizeState(state: StoredState): StoredState {
  return { items: state.items.map((item) => normalizeItem(item)) };
}

export function mergeItems(existing: SavedItem[], incoming: SavedItem[]): SavedItem[] {
  const byId = new Map<string, SavedItem>();
  for (const item of existing) byId.set(item.id, item);
  for (const item of incoming) {
    const current = byId.get(item.id);
    byId.set(
      item.id,
      current
        ? {
            ...item,
            status: current.status,
            tags: current.tags,
            note: current.note
          }
        : item
    );
  }

  return [...byId.values()].sort((a, b) => b.discoveredAt.localeCompare(a.discoveredAt));
}
