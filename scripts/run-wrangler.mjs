#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const localWrangler = join(
  "node_modules",
  ".bin",
  process.platform === "win32" ? "wrangler.cmd" : "wrangler"
);

if (!existsSync(localWrangler)) {
  console.error(
    "Wrangler is not installed in this project. Run `yarn install` or `npm install`, then retry."
  );
  process.exit(127);
}

const result = spawnSync(localWrangler, process.argv.slice(2), { stdio: "inherit" });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 0);
