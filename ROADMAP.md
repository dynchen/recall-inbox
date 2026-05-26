# Roadmap

Recall Inbox is not trying to become a full bookmark archive like Linkwarden or
Karakeep. The project focuses on a narrower workflow: pull saved items from
other services, review them quickly, and turn the useful ones into actions,
references, or Markdown.

## Near Term

These are the highest-value improvements for early users and contributors.

### Source Adapters

- Add more saved-item sources, starting with services that already have clear
  user intent: Weibo favorites, Readwise Reader, Raindrop, Pocket exports, and
  browser bookmarks.
- Keep each adapter small and testable. Use the
  [Source Adapter Guide](docs/source-adapter.md) for field mapping, pagination,
  auth, and test expectations.
- Keep source readiness and authorization status clear in the Sources dialog as
  more adapters are added.

### Review Workflow

- Basic queue presets now cover unreviewed, action, and source-specific review flows.
- Daily Review, source/status filters, and source setup now live in the review
  surface instead of the top navigation.
- Continue refining keyboard shortcuts for common review actions.
- Add batch actions for selected items.
- Expand Daily Review from the latest inbox queue into a configurable review
  window for newly synced items.
- Move from batched initial rendering to list virtualization when libraries grow
  beyond a few thousand items.

### Action Exports

- Make `action` items exportable as a separate Markdown section or file.
- Add optional exports for task systems such as GitHub Issues, Linear, Todoist,
  or Notion.
- Preserve a simple local-first path: Markdown should remain the reliable
  baseline export.

### GitHub Stars Intelligence

- Enrich GitHub stars with repository metadata such as last push time, archived
  state, license, primary language, and README summary.
- Help users decide whether a starred repository is worth trying, keeping as a
  reference, or dismissing as stale.
- Add filters for language, activity, and repository status.

### Deployment Experience

- Keep Cloudflare as the shortest hosted path.
- Document Vercel + Postgres as a supported alternative.
- Keep first-sync and backfill guidance current as source APIs and page limits
  change.
- Consider one-click or guided setup scripts only when they reduce real setup
  friction without hiding important secrets.

## Later

- Full-text search across fetched content.
- Optional AI summaries focused on next actions, not just generic summaries.
- Browser extension or share target for manually saving new links.
- Import/export tools for moving data between Recall Inbox and other bookmark
  managers.
- Read-only demo deployment for people evaluating the project.

## Non-Goals

- Replacing full webpage archiving tools.
- Competing with team bookmark managers on collaboration features.
- Requiring AI services for the core workflow.
- Locking data into a hosted service or proprietary format.
