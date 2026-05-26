import type { SavedItem, SavedItemStatus } from "./types.js";
import type { AssistantStore } from "./store/store.js";

const VALID_STATUSES = new Set<SavedItemStatus>(["inbox", "keep", "action", "dismiss"]);

export interface PatchItemBody {
  status?: SavedItemStatus;
  tags?: string[];
  note?: string;
}

export function sanitizePatchBody(body: unknown): PatchItemBody {
  const input = body as PatchItemBody;
  const patch: PatchItemBody = {};

  if (input.status !== undefined) {
    if (!VALID_STATUSES.has(input.status)) throw new Error("Invalid status.");
    patch.status = input.status;
  }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.some((tag) => typeof tag !== "string")) {
      throw new Error("Invalid tags.");
    }
    patch.tags = input.tags.map((tag) => tag.trim()).filter(Boolean);
  }
  if (input.note !== undefined) {
    if (typeof input.note !== "string") throw new Error("Invalid note.");
    patch.note = input.note;
  }

  return patch;
}

export async function readReviewItemsFromStore(store: AssistantStore): Promise<SavedItem[]> {
  return (await store.readState()).items;
}

export async function updateReviewItemInStore(
  store: AssistantStore,
  id: string,
  body: unknown
): Promise<SavedItem | null> {
  const patch = sanitizePatchBody(body);
  const state = await store.readState();
  const index = state.items.findIndex((item) => item.id === id);
  if (index === -1) return null;

  const updated = { ...state.items[index], ...patch };
  state.items[index] = updated;
  await store.writeState(state);
  return updated;
}
