import type { AppConfig, SavedItem, XTokenSet } from "../../types.js";
import { refreshXToken } from "./token.js";
import type { AssistantStore } from "../../store/store.js";

const API_BASE = "https://api.x.com/2";

interface XUser {
  id: string;
  name: string;
  username: string;
}

interface XTweet {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
}

interface XBookmarkResponse {
  data?: XTweet[];
  includes?: {
    users?: XUser[];
  };
  meta?: {
    next_token?: string;
  };
}

async function xFetch<T>(path: string, token: XTokenSet): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token.access_token}` }
  });

  if (!response.ok) {
    throw new Error(`X API failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as T;
}

export async function getXUserId(token: XTokenSet): Promise<string> {
  const response = await xFetch<{ data: XUser }>("/users/me", token);
  return response.data.id;
}

export async function getValidXToken(config: AppConfig, store: AssistantStore): Promise<XTokenSet> {
  const token = await store.readXToken();
  if (!token) throw new Error("No X token found. Run npm run auth:x first.");

  const refreshed = await refreshXToken(config, token);
  if (refreshed.access_token !== token.access_token) {
    await store.writeXToken(refreshed);
  }
  return refreshed;
}

export interface FetchXBookmarksOptions {
  knownItemIds?: Set<string>;
  maxPages?: number;
}

export async function fetchXBookmarks(
  token: XTokenSet,
  userId: string,
  options: FetchXBookmarksOptions = {}
): Promise<SavedItem[]> {
  const items: SavedItem[] = [];
  let nextToken: string | undefined;
  let fetchedPages = 0;
  const fetchedAt = new Date().toISOString();

  do {
    fetchedPages += 1;
    const params = new URLSearchParams({
      max_results: "100",
      "tweet.fields": "created_at,author_id",
      expansions: "author_id",
      "user.fields": "username,name"
    });
    if (nextToken) params.set("pagination_token", nextToken);

    const response = await xFetch<XBookmarkResponse>(
      `/users/${userId}/bookmarks?${params.toString()}`,
      token
    );
    const users = new Map((response.includes?.users ?? []).map((user) => [user.id, user]));

    const pageItems: SavedItem[] = [];
    for (const tweet of response.data ?? []) {
      const author = tweet.author_id ? users.get(tweet.author_id) : undefined;
      pageItems.push({
        id: `x:${tweet.id}`,
        source: "x",
        sourceItemId: tweet.id,
        url: `https://x.com/${author?.username ?? "i"}/status/${tweet.id}`,
        authorName: author?.name,
        authorHandle: author?.username,
        text: tweet.text,
        discoveredAt: fetchedAt,
        createdAt: tweet.created_at,
        tags: []
      });
    }
    items.push(...pageItems);

    nextToken = response.meta?.next_token;
    if (options.maxPages && fetchedPages >= options.maxPages) {
      break;
    }
    if (
      options.knownItemIds &&
      pageItems.length > 0 &&
      pageItems.every((item) => options.knownItemIds?.has(item.id))
    ) {
      break;
    }
  } while (nextToken);

  return items;
}
