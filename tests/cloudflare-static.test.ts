import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("cloudflare worker exposes fetch and scheduled handlers", async () => {
  const worker = await readFile("src/worker.ts", "utf8");

  assert.match(worker, /export default/);
  assert.match(worker, /async fetch\(/);
  assert.match(worker, /async scheduled\(/);
  assert.match(worker, /runCloudflareSync/);
});

test("cloudflare deployment uses D1, static assets, and daily cron", async () => {
  const wranglerExample = await readFile("wrangler.example.toml", "utf8");
  const migration = await readFile("migrations/0001_initial.sql", "utf8");

  assert.match(wranglerExample, /main = "dist\/src\/worker\.js"/);
  assert.match(wranglerExample, /binding = "DB"/);
  assert.match(wranglerExample, /directory = "\.\/dist\/view"/);
  assert.match(wranglerExample, /crons = \["15 18 \* \* \*"\]/);
  assert.match(wranglerExample, /database_id = "<your-d1-database-id>"/);
  assert.match(wranglerExample, /preview_database_id = "<your-preview-d1-database-id>"/);
  assert.doesNotMatch(wranglerExample, /a1f659ee-a726-43a9-800b-aaf70585dcdb/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS items/);
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'inbox'/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS source_tokens/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS oauth_states/);
  assert.match(migration, /code_verifier TEXT NOT NULL/);
});

test("open source release files avoid local secrets and document deployment", async () => {
  const readme = await readFile("README.md", "utf8");
  const gitignore = await readFile(".gitignore", "utf8");
  const envExample = await readFile(".env.example", "utf8");
  const security = await readFile("SECURITY.md", "utf8");
  const packageJson = await readFile("package.json", "utf8");
  const license = await readFile("LICENSE", "utf8");
  const parsedPackage = JSON.parse(packageJson) as { license?: string };

  assert.match(readme, /cp wrangler\.example\.toml wrangler\.toml/);
  assert.match(readme, /inbox \/ keep \/ action \/ dismiss/);
  assert.match(readme, /SYNC_MAX_PAGES_PER_SOURCE/);
  assert.match(readme, /SUMMARY_API_KEY/);
  assert.doesNotMatch(readme, /OPENAI_API_KEY/);
  assert.match(readme, /First large sync/);
  assert.match(readme, /ADMIN_SECRET/);
  assert.match(readme, /yarn cf:setup/);
  assert.match(readme, /yarn cf:release/);
  assert.match(readme, /yarn wrangler secret put ADMIN_SECRET/);
  assert.doesNotMatch(readme, /npm run/);
  assert.doesNotMatch(readme, /npx wrangler/);
  assert.doesNotMatch(readme, /auth\/x\/start\?token=<ADMIN_SECRET>/);
  assert.doesNotMatch(readme, /todo \/ done \/ ignored/);
  assert.doesNotMatch(readme, /CRON_SECRET/);
  assert.match(gitignore, /^wrangler\.toml$/m);
  assert.match(gitignore, /^package-lock\.json$/m);
  assert.match(envExample, /SYNC_MAX_PAGES_PER_SOURCE=/);
  assert.match(envExample, /SUMMARY_API_KEY=/);
  assert.match(envExample, /SUMMARY_BASE_URL=/);
  assert.doesNotMatch(envExample, /OPENAI_API_KEY=/);
  assert.match(envExample, /ADMIN_SECRET=/);
  assert.doesNotMatch(envExample, /CRON_SECRET=/);
  assert.match(security, /Do Not Commit/);
  assert.match(security, /X_CLIENT_SECRET/);
  assert.match(security, /ADMIN_SECRET/);
  assert.match(security, /POSTGRES_URL/);
  assert.match(security, /Vercel environment variables/);
  assert.match(security, /Do not expose a deployment without `ADMIN_SECRET`/);
  assert.match(security, /yarn wrangler secret put ADMIN_SECRET/);
  assert.doesNotMatch(security, /npx wrangler/);
  assert.doesNotMatch(security, /CRON_SECRET/);
  assert.equal(parsedPackage.license, "MIT");
  assert.match(license, /MIT License/);
  await assert.rejects(() => access("package-lock.json"));
  assert.doesNotMatch(packageJson, /"private"\s*:\s*true/);
});

test("cloudflare setup scripts document repeatable deployment", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const setupScript = await readFile("scripts/cf-setup.mjs", "utf8");
  const readme = await readFile("README.md", "utf8");

  assert.equal(packageJson.scripts["cf:setup"], "node scripts/cf-setup.mjs");
  assert.equal(packageJson.scripts["cf:migrate"], "node scripts/run-wrangler.mjs d1 migrations apply DB --remote");
  assert.equal(packageJson.scripts["cf:migrate:remote"], undefined);
  assert.equal(packageJson.scripts["cf:deploy"], "tsc -p tsconfig.json && vite build && node scripts/run-wrangler.mjs deploy");
  assert.equal(packageJson.scripts["cf:release"], "tsc -p tsconfig.json && vite build && node scripts/run-wrangler.mjs d1 migrations apply DB --remote && node scripts/run-wrangler.mjs deploy");
  assert.equal(packageJson.devDependencies.wrangler, "4.94.0");
  assert.match(packageJson.scripts["cf:deploy"], /scripts\/run-wrangler\.mjs deploy/);
  assert.match(setupScript, /wrangler\.example\.toml/);
  assert.match(setupScript, /RUN_WRANGLER/);
  assert.match(setupScript, /\["scripts\/run-wrangler\.mjs", "d1", "create", name\]/);
  assert.doesNotMatch(setupScript, /run\("npx"/);
  assert.doesNotMatch(setupScript, /--json/);
  assert.match(setupScript, /database_id\\s\*=/);
  assert.match(setupScript, /already exists/);
  assert.match(setupScript, /DATABASE_NAME = "inbox"/);
  assert.match(setupScript, /PREVIEW_DATABASE_NAME = "inbox-preview"/);
  assert.match(setupScript, /--force/);
  assert.match(setupScript, /<your-d1-database-id>/);
  assert.match(setupScript, /<your-preview-d1-database-id>/);
  assert.match(readme, /yarn cf:setup/);
  assert.match(readme, /yarn cf:release/);
  assert.match(readme, /yarn install/);
});
