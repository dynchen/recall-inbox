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
