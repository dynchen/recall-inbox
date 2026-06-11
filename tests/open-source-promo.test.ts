import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("readme presents the project for first-time open source visitors", async () => {
  const readme = await readFile("README.md", "utf8");

  assert.match(readme, /^# Recall Inbox\n\nA self-hosted inbox/m);
  assert.match(readme, /!\[Recall Inbox screenshot\]\(docs\/assets\/recall-inbox-screenshot\.png\)/);
  assert.match(readme, /## Who It Is For/);
  assert.match(readme, /## One-Minute Demo/);
  assert.match(readme, /https:\/\/recall-inbox-demo\.kapler\.workers\.dev/);
  assert.match(readme, /## Deployment Options/);
  assert.match(readme, /### Credential Guide/);
  assert.match(readme, /Starring` user permission set to read/);
  assert.doesNotMatch(readme, /roadmap/i);
  assert.match(readme, /sync -> review -> tag\/note -> export/);
  assert.match(readme, /\[Source Adapter Guide\]\(docs\/source-adapter\.md\)/);
  await access("docs/assets/recall-inbox-screenshot.png");
  await access("docs/source-adapter.md");
  await assert.rejects(() => access("ROADMAP.md"));
});

test("package scripts do not include a local fake-data demo", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };

  assert.equal(packageJson.scripts.demo, undefined);
  await assert.rejects(() => access("scripts/seed-demo.mjs"));
});
