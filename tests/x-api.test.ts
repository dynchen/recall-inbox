import assert from "node:assert/strict";
import test from "node:test";
import { fetchXBookmarks } from "../src/sources/x/api.js";

test("fetchXBookmarks stops after a page where every item is already known", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  const pages = [
    {
      data: [{ id: "1", text: "new", author_id: "u1" }],
      includes: { users: [{ id: "u1", name: "User", username: "user" }] },
      meta: { next_token: "page2" }
    },
    {
      data: [{ id: "2", text: "known", author_id: "u1" }],
      includes: { users: [{ id: "u1", name: "User", username: "user" }] },
      meta: { next_token: "page3" }
    },
    {
      data: [{ id: "3", text: "should not be fetched", author_id: "u1" }],
      includes: { users: [{ id: "u1", name: "User", username: "user" }] },
      meta: {}
    }
  ];

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    const page = pages[requestedUrls.length - 1];
    return new Response(JSON.stringify(page), { status: 200 });
  }) as typeof fetch;

  try {
    const items = await fetchXBookmarks({ access_token: "token" }, "user-id", {
      knownItemIds: new Set(["x:2"])
    });

    assert.deepEqual(
      items.map((item) => item.id),
      ["x:1", "x:2"]
    );
    assert.equal(requestedUrls.length, 2);
    assert.equal(items[0].discoveredAt.length > 0, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchXBookmarks respects maxPages", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    return new Response(
      JSON.stringify({
        data: [{ id: String(requestedUrls.length), text: "bookmark", author_id: "u1" }],
        includes: { users: [{ id: "u1", name: "User", username: "user" }] },
        meta: { next_token: `page${requestedUrls.length + 1}` }
      }),
      { status: 200 }
    );
  }) as typeof fetch;

  try {
    const items = await fetchXBookmarks({ access_token: "token" }, "user-id", { maxPages: 2 });

    assert.deepEqual(
      items.map((item) => item.id),
      ["x:1", "x:2"]
    );
    assert.equal(requestedUrls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchXBookmarks uses note_tweet text for long posts", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    return new Response(
      JSON.stringify({
        data: [
          {
            id: "1",
            text: "short preview...",
            note_tweet: { text: "full long post text that should be stored" },
            author_id: "u1"
          }
        ],
        includes: { users: [{ id: "u1", name: "User", username: "user" }] },
        meta: {}
      }),
      { status: 200 }
    );
  }) as typeof fetch;

  try {
    const items = await fetchXBookmarks({ access_token: "token" }, "user-id");

    assert.match(requestedUrls[0], /tweet\.fields=created_at%2Cauthor_id%2Cnote_tweet/);
    assert.equal(items[0].text, "full long post text that should be stored");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchXBookmarks stores source metadata for richer review context", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    return new Response(
      JSON.stringify({
        data: [
          {
            id: "1",
            text: "post with link and media",
            author_id: "u1",
            lang: "en",
            possibly_sensitive: false,
            public_metrics: { retweet_count: 2, reply_count: 3, like_count: 5, quote_count: 1, bookmark_count: 8, impression_count: 100 },
            entities: { urls: [{ url: "https://t.co/a", expanded_url: "https://example.com" }] },
            attachments: { media_keys: ["m1"] },
            referenced_tweets: [{ type: "quoted", id: "2" }]
          }
        ],
        includes: {
          users: [{ id: "u1", name: "User", username: "user" }],
          media: [{ media_key: "m1", type: "photo", url: "https://pbs.twimg.com/media/1.jpg" }],
          tweets: [{ id: "2", text: "quoted post" }]
        },
        meta: {}
      }),
      { status: 200 }
    );
  }) as typeof fetch;

  try {
    const items = await fetchXBookmarks({ access_token: "token" }, "user-id");

    assert.match(requestedUrls[0], /public_metrics/);
    assert.match(requestedUrls[0], /attachments\.media_keys/);
    assert.deepEqual(items[0].metadata, {
      x: {
        lang: "en",
        possiblySensitive: false,
        publicMetrics: { retweet_count: 2, reply_count: 3, like_count: 5, quote_count: 1, bookmark_count: 8, impression_count: 100 },
        entities: { urls: [{ url: "https://t.co/a", expanded_url: "https://example.com" }] },
        attachments: { media_keys: ["m1"] },
        media: [{ media_key: "m1", type: "photo", url: "https://pbs.twimg.com/media/1.jpg" }],
        referencedTweets: [{ type: "quoted", id: "2" }],
        referencedTweetObjects: [{ id: "2", text: "quoted post" }]
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
