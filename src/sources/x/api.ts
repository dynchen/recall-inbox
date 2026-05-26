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
  lang?: string;
  possibly_sensitive?: boolean;
  public_metrics?: Record<string, number>;
  entities?: Record<string, unknown>;
  attachments?: {
    media_keys?: string[];
  };
  referenced_tweets?: Array<{
    type: string;
    id: string;
  }>;
  note_tweet?: {
    text?: string;
  };
}

interface XMedia {
  media_key: string;
  type: string;
  url?: string;
  preview_image_url?: string;
}

interface XBookmarkResponse {
  data?: XTweet[];
  includes?: {
    users?: XUser[];
    media?: XMedia[];
    tweets?: XTweet[];
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

function compactObject<T extends Record<string, unknown>>(object: T): Partial<T> {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function tweetMetadata(
  tweet: XTweet,
  mediaByKey: Map<string, XMedia>,
  referencedTweetsById: Map<string, XTweet>
): SavedItem["metadata"] | undefined {
  const media = tweet.attachments?.media_keys
    ?.map((mediaKey) => mediaByKey.get(mediaKey))
    .filter((media): media is XMedia => Boolean(media));
  const referencedTweetObjects = tweet.referenced_tweets
    ?.map((referencedTweet) => referencedTweetsById.get(referencedTweet.id))
    .filter((referencedTweet): referencedTweet is XTweet => Boolean(referencedTweet));
  const x = compactObject({
    lang: tweet.lang,
    possiblySensitive: tweet.possibly_sensitive,
    publicMetrics: tweet.public_metrics,
    entities: tweet.entities,
    attachments: tweet.attachments,
    media: media?.length ? media : undefined,
    referencedTweets: tweet.referenced_tweets,
    referencedTweetObjects: referencedTweetObjects?.length ? referencedTweetObjects : undefined
  });

  return Object.keys(x).length ? { x } : undefined;
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
      "tweet.fields": "created_at,author_id,note_tweet,public_metrics,entities,attachments,referenced_tweets,lang,possibly_sensitive",
      expansions: "author_id,attachments.media_keys,referenced_tweets.id",
      "media.fields": "type,url,preview_image_url",
      "user.fields": "username,name"
    });
    if (nextToken) params.set("pagination_token", nextToken);

    const response = await xFetch<XBookmarkResponse>(
      `/users/${userId}/bookmarks?${params.toString()}`,
      token
    );
    const users = new Map((response.includes?.users ?? []).map((user) => [user.id, user]));
    const mediaByKey = new Map((response.includes?.media ?? []).map((media) => [media.media_key, media]));
    const referencedTweetsById = new Map((response.includes?.tweets ?? []).map((tweet) => [tweet.id, tweet]));

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
        text: tweet.note_tweet?.text ?? tweet.text,
        discoveredAt: fetchedAt,
        createdAt: tweet.created_at,
        tags: [],
        metadata: tweetMetadata(tweet, mediaByKey, referencedTweetsById)
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
