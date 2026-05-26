import assert from "node:assert/strict";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("readme presents the project for first-time open source visitors", async () => {
  const readme = await readFile("README.md", "utf8");

  assert.match(readme, /^# Recall Inbox\n\nA self-hosted inbox/m);
  assert.match(readme, /!\[Recall Inbox screenshot\]\(docs\/assets\/recall-inbox-screenshot\.png\)/);
  assert.match(readme, /## Who It Is For/);
  assert.match(readme, /## One-Minute Demo/);
  assert.match(readme, /## Deployment Options/);
  assert.match(readme, /### Credential Guide/);
  assert.match(readme, /Starring` user permission set to read/);
  assert.match(readme, /\[Roadmap\]\(ROADMAP\.md\)/);
  assert.match(readme, /sync -> review -> tag\/note -> export/);
  assert.match(readme, /\[Source Adapter Guide\]\(docs\/source-adapter\.md\)/);
  await access("docs/assets/recall-inbox-screenshot.png");
  await access("docs/source-adapter.md");
  await access("ROADMAP.md");
});

test("roadmap emphasizes the most valuable near-term open source work", async () => {
  const roadmap = await readFile("ROADMAP.md", "utf8");

  assert.match(roadmap, /## Near Term/);
  assert.match(roadmap, /### Source Adapters/);
  assert.match(roadmap, /Weibo favorites/);
  assert.match(roadmap, /### Review Workflow/);
  assert.match(roadmap, /### Action Exports/);
  assert.match(roadmap, /### GitHub Stars Intelligence/);
  assert.match(roadmap, /### Deployment Experience/);
  assert.match(roadmap, /## Non-Goals/);
});

test("demo script seeds local sample data for the review UI", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.equal(packageJson.scripts.demo, "node scripts/seed-demo.mjs");
  await access("scripts/seed-demo.mjs");

  const cwd = await mkdtemp(path.join(tmpdir(), "recall-inbox-demo-"));
  const scriptPath = path.resolve("scripts/seed-demo.mjs");
  const result = spawnSync(process.execPath, [scriptPath], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const state = JSON.parse(await readFile(path.join(cwd, ".data/items.json"), "utf8")) as { items: unknown[] };
  assert.equal(state.items.length, 4);
});
