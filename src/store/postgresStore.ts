import postgres from "postgres";
import type { OAuthStateRecord } from "../runtime/store.js";
import type { SavedItem, SourceName, StoredState, XTokenSet } from "../types.js";
import { normalizeState, type AssistantStore } from "./store.js";

type Sql = ReturnType<typeof postgres>;

interface ItemRow {
  id: string;
  source: SourceName;
  source_item_id: string;
  url: string;
  author_name: string | null;
  author_handle: string | null;
  text: string;
  discovered_at: string;
  created_at: string | null;
  tags_json: string | string[];
  metadata_json: Record<string, unknown> | string | null;
  status: SavedItem["status"] | null;
  note: string | null;
}

interface TokenRow {
  token_json: XTokenSet | string;
}

interface OAuthStateRow {
  code_verifier: string;
  redirect_uri: string;
  expires_at: string;
}

function jsonArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : JSON.parse(value) as string[];
}

function tokenJson(value: XTokenSet | string): XTokenSet {
  return typeof value === "string" ? JSON.parse(value) as XTokenSet : value;
}

function metadataJson(value: Record<string, unknown> | string | null): Record<string, unknown> | undefined {
  if (!value) return undefined;
  return typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : value;
}

function rowToItem(row: ItemRow): SavedItem {
  const metadata = metadataJson(row.metadata_json);
  return {
    id: row.id,
    source: row.source,
    sourceItemId: row.source_item_id,
    url: row.url,
    authorName: row.author_name ?? undefined,
    authorHandle: row.author_handle ?? undefined,
    text: row.text,
    discoveredAt: row.discovered_at,
    createdAt: row.created_at ?? undefined,
    tags: jsonArray(row.tags_json),
    status: row.status ?? "inbox",
    note: row.note ?? "",
    ...(metadata ? { metadata } : {})
  };
}

export function createPostgresClient(url: string): Sql {
  return postgres(url, { max: 1, idle_timeout: 20, connect_timeout: 10 });
}

export class PostgresStore implements AssistantStore {
  constructor(private readonly sql: Sql) {}

  async readState(): Promise<StoredState> {
    const rows = await this.sql<ItemRow[]>`
      SELECT id, source, source_item_id, url, author_name, author_handle, text,
        discovered_at, created_at, tags_json, metadata_json, status, note
      FROM items
      ORDER BY discovered_at DESC
    `;
    return normalizeState({ items: rows.map(rowToItem) });
  }

  async writeState(state: StoredState): Promise<void> {
    await this.sql.begin(async (sql) => {
      for (const item of state.items) {
        await sql`
          INSERT INTO items (
            id, source, source_item_id, url, author_name, author_handle, text,
            discovered_at, created_at, tags_json, metadata_json, status, note
          ) VALUES (
            ${item.id}, ${item.source}, ${item.sourceItemId}, ${item.url},
            ${item.authorName ?? null}, ${item.authorHandle ?? null}, ${item.text},
            ${item.discoveredAt}, ${item.createdAt ?? null}, ${JSON.stringify(item.tags ?? [])},
            ${item.metadata ? JSON.stringify(item.metadata) : null}, ${item.status ?? "inbox"}, ${item.note ?? ""}
          )
          ON CONFLICT(id) DO UPDATE SET
            source = excluded.source,
            source_item_id = excluded.source_item_id,
            url = excluded.url,
            author_name = excluded.author_name,
            author_handle = excluded.author_handle,
            text = excluded.text,
            discovered_at = excluded.discovered_at,
            created_at = excluded.created_at,
            tags_json = excluded.tags_json,
            metadata_json = excluded.metadata_json,
            status = excluded.status,
            note = excluded.note
        `;
      }
    });
  }

  async readXToken(): Promise<XTokenSet | null> {
    const rows = await this.sql<TokenRow[]>`
      SELECT token_json FROM source_tokens WHERE source = 'x'
    `;
    return rows[0] ? tokenJson(rows[0].token_json) : null;
  }

  async writeXToken(token: XTokenSet): Promise<void> {
    await this.sql`
      INSERT INTO source_tokens (source, token_json, updated_at)
      VALUES ('x', ${JSON.stringify(token)}, ${new Date().toISOString()})
      ON CONFLICT(source) DO UPDATE SET
        token_json = excluded.token_json,
        updated_at = excluded.updated_at
    `;
  }

  async writeOAuthState(state: OAuthStateRecord): Promise<void> {
    await this.sql`
      INSERT INTO oauth_states (state, code_verifier, redirect_uri, expires_at)
      VALUES (${state.state}, ${state.codeVerifier}, ${state.redirectUri}, ${state.expiresAt})
    `;
  }

  async readOAuthState(state: string): Promise<OAuthStateRecord | null> {
    const rows = await this.sql<OAuthStateRow[]>`
      SELECT code_verifier, redirect_uri, expires_at FROM oauth_states WHERE state = ${state}
    `;
    const row = rows[0];
    return row
      ? {
          state,
          codeVerifier: row.code_verifier,
          redirectUri: row.redirect_uri,
          expiresAt: row.expires_at
        }
      : null;
  }

  async deleteOAuthState(state: string): Promise<void> {
    await this.sql`DELETE FROM oauth_states WHERE state = ${state}`;
  }
}
