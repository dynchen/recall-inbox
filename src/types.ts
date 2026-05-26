export type SourceName = "x" | "github";
export type SavedItemStatus = "inbox" | "keep" | "action" | "dismiss";

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

export interface StoredState {
  items: SavedItem[];
}

export interface XTokenSet {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  scope?: string;
  token_type?: string;
}

export interface AppConfig {
  xClientId?: string;
  xClientSecret?: string;
  xRedirectUri: string;
  dataDir: string;
  outputDir: string;
  summaryApiKey?: string;
  summaryModel: string;
  summaryBaseUrl: string;
  githubToken?: string;
}
