import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const statePath = path.join(process.cwd(), ".data", "items.json");
const force = process.argv.includes("--force");

async function existingStateHasItems() {
  try {
    const state = JSON.parse(await readFile(statePath, "utf8"));
    return Array.isArray(state.items) && state.items.length > 0;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

const items = [
  {
    id: "github:base-ui/base-ui",
    source: "github",
    sourceItemId: "base-ui/base-ui",
    url: "https://github.com/mui/base-ui",
    authorName: "base-ui",
    authorHandle: "base-ui",
    text: "Unstyled, accessible components for building design systems and polished internal tools.",
    discoveredAt: "2026-05-26T09:00:00.000Z",
    createdAt: "2026-05-26T09:00:00.000Z",
    tags: ["github", "react", "ui"],
    status: "inbox",
    note: ""
  },
  {
    id: "x:demo-productivity-thread",
    source: "x",
    sourceItemId: "demo-productivity-thread",
    url: "https://x.com/example/status/1001",
    authorName: "Product Builder",
    authorHandle: "builder",
    text: "A useful saved thread about turning passive bookmarks into a weekly review workflow.",
    discoveredAt: "2026-05-25T14:30:00.000Z",
    createdAt: "2026-05-25T14:20:00.000Z",
    tags: ["workflow"],
    status: "action",
    note: "Convert this into a weekend review checklist."
  },
  {
    id: "github:openai/openai-agents-js",
    source: "github",
    sourceItemId: "openai/openai-agents-js",
    url: "https://github.com/openai/openai-agents-js",
    authorName: "openai",
    authorHandle: "openai",
    text: "A TypeScript framework for building agentic applications with composable tools and handoffs.",
    discoveredAt: "2026-05-24T10:10:00.000Z",
    createdAt: "2026-05-24T10:10:00.000Z",
    tags: ["github", "agents", "typescript"],
    status: "keep",
    note: "Review examples before adding AI summaries."
  },
  {
    id: "x:demo-reading-note",
    source: "x",
    sourceItemId: "demo-reading-note",
    url: "https://x.com/example/status/1002",
    authorName: "Research Notes",
    authorHandle: "notes",
    text: "Bookmarks become useful when they are grouped by intent: read later, reference, action, or ignore.",
    discoveredAt: "2026-05-23T08:15:00.000Z",
    createdAt: "2026-05-23T08:05:00.000Z",
    tags: ["reading", "pkm"],
    status: "inbox",
    note: ""
  }
];

if (!force && await existingStateHasItems()) {
  console.log(".data/items.json already has items. Re-run with --force to replace it with demo data.");
  process.exit(0);
}

await mkdir(path.dirname(statePath), { recursive: true });
await writeFile(statePath, `${JSON.stringify({ items }, null, 2)}\n`, "utf8");
console.log(`Seeded ${items.length} demo items into ${statePath}`);
