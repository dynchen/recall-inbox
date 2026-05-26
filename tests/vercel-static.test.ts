import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("vercel deployment exposes api adapters and cron configuration", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
  };
  const vercelConfig = await readFile("vercel.json", "utf8");
  const apiSync = await readFile("api/sync.ts", "utf8");
  const apiItems = await readFile("api/items.ts", "utf8");
  const apiCron = await readFile("api/cron/sync.ts", "utf8");
  const vercelRuntime = await readFile("src/runtime/vercel.ts", "utf8");
  const readme = await readFile("README.md", "utf8");

  assert.equal(packageJson.scripts["vercel:build"], "tsc -p tsconfig.json && vite build");
  assert.match(packageJson.dependencies.postgres, /^\d/);
  assert.match(vercelConfig, /"path": "\/api\/cron\/sync"/);
  assert.match(apiSync, /handleVercelNodeRequest/);
  assert.match(apiItems, /handleVercelNodeRequest/);
  assert.match(apiCron, /handleVercelCronSync/);
  assert.match(vercelRuntime, /PostgresStore/);
  assert.match(readme, /Vercel Deployment/);
  assert.match(readme, /POSTGRES_URL/);
  await access("api/auth/x/start.ts");
  await access("api/auth/x/callback.ts");
});
