import type { XTokenSet } from "../types.js";
import type { AssistantStore } from "../store/store.js";

export interface OAuthStateRecord {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  expiresAt: string;
}

export interface RuntimeStore extends AssistantStore {
  writeOAuthState(state: OAuthStateRecord): Promise<void>;
  readOAuthState(state: string): Promise<OAuthStateRecord | null>;
  deleteOAuthState(state: string): Promise<void>;
}

export type { XTokenSet };
