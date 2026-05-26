import type { SavedItem, SourceName, StoredState, XTokenSet } from "../types.js";
import type { OAuthStateRecord } from "../runtime/store.js";
import { normalizeState, type AssistantStore } from "./store.js";

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = unknown>(): Promise<{ results?: T[] }>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<unknown>;
}

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
  tags_json: string;
  metadata_json: string | null;
  status: SavedItem["status"] | null;
  note: string | null;
}

interface TokenRow {
  token_json: string;
}

interface OAuthStateRow {
  code_verifier: string;
  redirect_uri: string;
  expires_at: string;
}

function rowToItem(row: ItemRow): SavedItem {
  const metadata = row.metadata_json ? JSON.parse(row.metadata_json) as Record<string, unknown> : undefined;
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
    tags: JSON.parse(row.tags_json) as string[],
    status: row.status ?? "inbox",
    note: row.note ?? "",
    ...(metadata ? { metadata } : {})
  };
}

function bindItem(statement: D1PreparedStatement, item: SavedItem): D1PreparedStatement {
  return statement.bind(
    item.id,
    item.source,
    item.sourceItemId,
    item.url,
    item.authorName ?? null,
    item.authorHandle ?? null,
    item.text,
    item.discoveredAt,
    item.createdAt ?? null,
    JSON.stringify(item.tags ?? []),
    item.metadata ? JSON.stringify(item.metadata) : null,
    item.status ?? "inbox",
    item.note ?? ""
  );
}

export class D1Store implements AssistantStore {
  constructor(private readonly db: D1Database) {}

  async readState(): Promise<StoredState> {
    const result = await this.db
      .prepare(
        `SELECT id, source, source_item_id, url, author_name, author_handle, text,
          discovered_at, created_at, tags_json, metadata_json, status, note
        FROM items
        ORDER BY discovered_at DESC`
      )
      .all<ItemRow>();
    return normalizeState({ items: (result.results ?? []).map(rowToItem) });
  }

  async writeState(state: StoredState): Promise<void> {
    const query = `INSERT INTO items (
      id, source, source_item_id, url, author_name, author_handle, text,
      discovered_at, created_at, tags_json, metadata_json, status, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      note = excluded.note`;
    const statements = state.items.map((item) => bindItem(this.db.prepare(query), item));
    for (let index = 0; index < statements.length; index += 100) {
      await this.db.batch(statements.slice(index, index + 100));
    }
  }

  async readXToken(): Promise<XTokenSet | null> {
    const row = await this.db
      .prepare("SELECT token_json FROM source_tokens WHERE source = ?")
      .bind("x")
      .first<TokenRow>();
    return row ? (JSON.parse(row.token_json) as XTokenSet) : null;
  }

  async writeXToken(token: XTokenSet): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO source_tokens (source, token_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(source) DO UPDATE SET
          token_json = excluded.token_json,
          updated_at = excluded.updated_at`
      )
      .bind("x", JSON.stringify(token), new Date().toISOString())
      .run();
  }

  async writeOAuthState(state: OAuthStateRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO oauth_states (state, code_verifier, redirect_uri, expires_at)
        VALUES (?, ?, ?, ?)`
      )
      .bind(state.state, state.codeVerifier, state.redirectUri, state.expiresAt)
      .run();
  }

  async readOAuthState(state: string): Promise<OAuthStateRecord | null> {
    const row = await this.db
      .prepare("SELECT code_verifier, redirect_uri, expires_at FROM oauth_states WHERE state = ?")
      .bind(state)
      .first<OAuthStateRow>();
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
    await this.db.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();
  }
}
