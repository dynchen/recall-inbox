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
- Make source readiness visible in the Admin dialog so users know what can sync
  and what still needs authorization.

### Review Workflow

- Add keyboard shortcuts for common review actions.
- Add batch actions for selected items.
- Improve filters for unreviewed items, action items, and source-specific
  queues.
- Add a daily review view that focuses on newly synced items instead of the full
  archive.

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
- Add clearer first-sync and backfill guidance for large existing libraries.
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
