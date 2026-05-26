import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

function scriptEntry(commandName: "auth:x" | "sync" | "sync:github" | "export:md" | "view"): string {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  const script = packageJson.scripts[commandName];
  const match = /^node\s+(\S+)(?:\s+|$)/.exec(script);
  assert.ok(match, `${commandName} script should run node with a compiled entry`);
  return match[1];
}

test("compiled CLI help exits successfully from npm script entry", () => {
  const result = spawnSync(process.execPath, [scriptEntry("auth:x"), "--help"], {
    encoding: "utf8"
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: node dist\/src\/cli\.js <auth:x\|sync\|sync:github\|export:md>/);
});

test("auth, sync, github sync, and export scripts point to the same compiled CLI entry", () => {
  assert.equal(scriptEntry("auth:x"), scriptEntry("sync"));
  assert.equal(scriptEntry("auth:x"), scriptEntry("sync:github"));
  assert.equal(scriptEntry("auth:x"), scriptEntry("export:md"));
});

test("view script points to the compiled review server", () => {
  assert.equal(scriptEntry("view"), "dist/src/server.js");
});
