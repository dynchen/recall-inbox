#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const WRANGLER_CONFIG = "wrangler.toml";
const WRANGLER_TEMPLATE = "wrangler.example.toml";
const RUN_WRANGLER = process.execPath;
const DATABASE_NAME = "inbox";
const PREVIEW_DATABASE_NAME = "inbox-preview";
const force = process.argv.includes("--force");

function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const stderr = error?.stderr?.toString().trim();
    const message = stderr || error?.message || "Command failed.";
    if (/already exists/i.test(message)) {
      throw new Error(
        `${command} ${args.join(" ")} failed because the D1 database already exists.\n` +
          "Delete the existing database in Cloudflare or update wrangler.toml manually with its id."
      );
    }
    throw new Error(`${command} ${args.join(" ")} failed:\n${message}`);
  }
}

function parseDatabaseId(output, name) {
  const trimmed = output.trim();
  const match = /database_id\s*=\s*"([^"]+)"/.exec(trimmed);
  if (match) return match[1];
  throw new Error(`Could not read D1 database id for ${name} from Wrangler output.`);
}

function createDatabase(name) {
  console.log(`Creating D1 database: ${name}`);
  const output = run(RUN_WRANGLER, ["scripts/run-wrangler.mjs", "d1", "create", name]);
  return parseDatabaseId(output, name);
}

function replaceRequired(text, from, to) {
  if (!text.includes(from)) {
    throw new Error(`Expected placeholder not found in ${WRANGLER_CONFIG}: ${from}`);
  }
  return text.replace(from, to);
}

if (force || !existsSync(WRANGLER_CONFIG)) {
  copyFileSync(WRANGLER_TEMPLATE, WRANGLER_CONFIG);
  console.log(`Created ${WRANGLER_CONFIG} from ${WRANGLER_TEMPLATE}.`);
}

const initialWrangler = readFileSync(WRANGLER_CONFIG, "utf8");
if (
  !initialWrangler.includes('database_id = "<your-d1-database-id>"') ||
  !initialWrangler.includes('preview_database_id = "<your-preview-d1-database-id>"')
) {
  throw new Error(
    `${WRANGLER_CONFIG} already has D1 ids. Remove it or run npm run cf:setup -- --force.`
  );
}

const databaseId = createDatabase(DATABASE_NAME);
const previewDatabaseId = createDatabase(PREVIEW_DATABASE_NAME);

let wrangler = initialWrangler;
wrangler = replaceRequired(wrangler, 'database_id = "<your-d1-database-id>"', `database_id = "${databaseId}"`);
wrangler = replaceRequired(
  wrangler,
  'preview_database_id = "<your-preview-d1-database-id>"',
  `preview_database_id = "${previewDatabaseId}"`
);
writeFileSync(WRANGLER_CONFIG, wrangler);

console.log(`Updated ${WRANGLER_CONFIG}.`);
console.log("");
console.log("Next steps:");
console.log("  npx wrangler secret put ADMIN_SECRET");
console.log("  npx wrangler secret put GITHUB_TOKEN      # optional");
console.log("  npx wrangler secret put X_CLIENT_ID       # optional");
console.log("  npx wrangler secret put X_CLIENT_SECRET   # optional");
console.log("  npm run cf:release");
