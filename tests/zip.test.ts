import assert from "node:assert/strict";
import test from "node:test";
import { createZip } from "../src/zip.js";

test("creates one archive containing all markdown files", () => {
  const archive = createZip([
    { filename: "2026-05-25.md", content: "# First\n\nStatus: action\n" },
    { filename: "2026-05-26.md", content: "# Second\n\nStatus: keep\n" }
  ]);
  const text = new TextDecoder().decode(archive);

  assert.match(text, /2026-05-25\.md/);
  assert.match(text, /2026-05-26\.md/);
  assert.match(text, /Status: action/);
  assert.match(text, /Status: keep/);
  assert.match(text, /PK\x05\x06/);
});
