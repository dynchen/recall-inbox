# Source Adapter Guide

Recall Inbox keeps source integrations intentionally small. A source adapter
fetches remote saved items, maps them into `SavedItem`, and lets the shared sync
job merge them into the store.

Use this guide when adding a source such as Weibo, Readwise, Pocket, Raindrop,
or another saved-items API.

## Contract

Every source used by the sync job implements `SyncSource`:

```ts
export interface SyncSource {
  name: string;
  fetch(knownItemIds: Set<string>): Promise<SavedItem[]>;
}
```

`runSyncSources` passes all currently stored item ids to each source. The source
can use that set to stop pagination once a full page is already known.

## Saved Item Mapping

Adapters must return normalized `SavedItem` objects:

```ts
export interface SavedItem {
  id: string;
  source: SourceName;
  sourceItemId: string;
  url: string;
  authorName?: string;
  authorHandle?: string;
  text: string;
  discoveredAt: string;
  createdAt?: string;
  tags: string[];
  status?: SavedItemStatus;
  note?: string;
}
```

Field rules:

- `id`: stable global id in the form `<source>:<sourceItemId>`.
- `source`: short source name, for example `x`, `github`, or `weibo`.
- `sourceItemId`: id from the remote system before prefixing.
- `url`: canonical public URL for opening the original item.
- `authorName`: display name when the source exposes it.
- `authorHandle`: stable username or account handle when available.
- `text`: the main searchable content shown in the review card.
- `discoveredAt`: when Recall Inbox fetched or first saw the item.
- `createdAt`: the source-native item date used for daily grouping.
- `tags`: source-derived tags only. User review tags are preserved during merge.
- `status` and `note`: normally omit them. The store normalizes defaults and
  preserves user review fields on existing items.

## Date Semantics

Prefer source-native creation or save time for `createdAt`.

Current examples:

- X bookmarks use the post `created_at` when available.
- GitHub stars use `starred_at`.

Use `discoveredAt` only for the fetch time. Do not use it for date grouping when
the source provides a better created/saved timestamp.

## Pagination

Adapters should support a page limit, usually through `CreateSyncSourceOptions`:

```ts
export interface CreateSyncSourceOptions {
  maxPages?: number;
  fullScan?: boolean;
}
```

Recommended behavior:

- Fetch newest items first when the source supports ordering.
- Stop when `maxPages` is reached.
- Stop when every item in a fetched page is already in `knownItemIds`.
- Support `fullScan` only when backfilling older data should continue past
  already-known pages.

GitHub uses `fullScan` because the first pages can already be synced while older
stars are still missing. X currently stops at the first fully known page.

## Authentication

Keep source-specific auth inside the source folder.

Recommended structure:

```text
src/sources/<source>/
  api.ts
  token.ts      # only if refresh or OAuth token logic is needed
  oauth.ts      # only if local OAuth helpers are needed
```

Configuration should be read through `AppConfig`. Add only the env fields the
source actually needs, for example:

```ts
export interface AppConfig {
  weiboToken?: string;
}
```

For hosted deployments, update both runtime config paths:

- `src/worker.ts` for Cloudflare.
- `src/runtime/vercel.ts` for Vercel.

If the source requires an interactive authorization flow, add protected hosted
routes following the X pattern instead of asking users to seed tokens manually.

## Store And Merge Behavior

Do not write directly to the store from a source adapter. Return fetched
`SavedItem[]` and let `runSyncSources` merge them.

The merge keeps local review fields from existing items:

- `status`
- `tags`
- `note`

This means an adapter can update remote text, URL, author metadata, and dates
without erasing review work.

## UI And Runtime Registration

After adding a source:

1. Extend `SourceName` in `src/types.ts`.
2. Add `src/sources/<source>/api.ts`.
3. Add `create<Source>SyncSource` in `src/jobs/sync.ts`.
4. Register the source in `runRuntimeSync` in `src/runtime/app.ts`.
5. Add readiness checks in the admin status response when the source needs
   credentials or authorization.
6. Add a manual sync button only if the source is user-facing in the first
   release.

Keep the first version minimal. A source can ship without custom UI if it works
through scheduled sync and the `/api/sync?source=<source>` endpoint.

## Tests

Add focused tests before implementation:

- API mapping test in `tests/<source>-api.test.ts`.
- Pagination stop test for `maxPages`.
- Known-page stop test using `knownItemIds`.
- `fullScan` test if the source supports backfill.
- Sync registration test when adding the source to hosted runtime sync.
- Admin readiness test if the source needs credentials or OAuth.

Existing references:

- `tests/github-api.test.ts`
- `tests/x-api.test.ts`
- `tests/sync-job.test.ts`
- `tests/worker-auth.test.ts`
- `tests/worker-sync.test.ts`

## Adapter Checklist

- [ ] Source returns stable ids with a source prefix.
- [ ] `createdAt` uses the source-native item/save date.
- [ ] `discoveredAt` is the fetch time.
- [ ] Pagination respects `maxPages`.
- [ ] Known-page stopping is covered by tests.
- [ ] Credentials are optional when the source is not configured.
- [ ] Hosted sync can skip unconfigured sources.
- [ ] Local review fields survive a resync.
- [ ] README mentions the new source and required token scopes.
