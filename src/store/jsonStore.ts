import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OAuthStateRecord, RuntimeStore } from "../runtime/store.js";
import type { StoredState, XTokenSet } from "../types.js";
import { normalizeState, mergeItems } from "./store.js";

const EMPTY_STATE: StoredState = { items: [] };
const EMPTY_OAUTH_STATES: OAuthStateRecord[] = [];

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonFile<T>(filePath: string, value: T): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export class JsonStore implements RuntimeStore {
  private readonly oauthStatesPath: string;
  private readonly tokenPath: string;
  private readonly statePath: string;

  constructor(private readonly dataDir: string) {
    this.oauthStatesPath = path.join(dataDir, "oauth-states.json");
    this.tokenPath = path.join(dataDir, "x-token.json");
    this.statePath = path.join(dataDir, "items.json");
  }

  readState(): Promise<StoredState> {
    return readJsonFile(this.statePath, EMPTY_STATE).then(normalizeState);
  }

  writeState(state: StoredState): Promise<void> {
    return writeJsonFile(this.statePath, state);
  }

  readXToken(): Promise<XTokenSet | null> {
    return readJsonFile<XTokenSet | null>(this.tokenPath, null);
  }

  writeXToken(token: XTokenSet): Promise<void> {
    return writeJsonFile(this.tokenPath, token);
  }

  async writeOAuthState(state: OAuthStateRecord): Promise<void> {
    const states = await readJsonFile(this.oauthStatesPath, EMPTY_OAUTH_STATES);
    await writeJsonFile(this.oauthStatesPath, [
      ...states.filter((current) => current.state !== state.state),
      state
    ]);
  }

  async readOAuthState(state: string): Promise<OAuthStateRecord | null> {
    const states = await readJsonFile(this.oauthStatesPath, EMPTY_OAUTH_STATES);
    return states.find((current) => current.state === state) ?? null;
  }

  async deleteOAuthState(state: string): Promise<void> {
    const states = await readJsonFile(this.oauthStatesPath, EMPTY_OAUTH_STATES);
    await writeJsonFile(this.oauthStatesPath, states.filter((current) => current.state !== state));
  }
}

export { mergeItems };
