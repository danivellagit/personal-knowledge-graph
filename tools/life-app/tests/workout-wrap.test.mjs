import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../health-training.fragments.txt"), "utf8");
const slice = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));

test("a workout note wraps inside the card instead of widening the row", () => {
  const ex = slice("const exLines", "const turn");
  const card = slice("const lifeExCard", "const noteDup");
  assert.match(src, /const exRight = \(e: TEx\) => \[doseTxt\(e\), kgTxt\(e\)\]\.filter\(Boolean\)\.join\(" · "\);/);
  assert.doesNotMatch(ex, /whiteSpace:\s*"nowrap"/);
  assert.doesNotMatch(card, /whiteSpace:\s*"nowrap"/);
  assert.match(ex, /overflowWrap:\s*"break-word"/);
  assert.match(card, /e\.note/);
  assert.match(src, /overflowWrap: "break-word"/);
});

test("the phone column is allowed to shrink to the viewport", () => {
  const app = readFileSync(join(here, "../src/app.tsx"), "utf8");
  assert.match(app, /width: "100%", maxWidth: 440, minWidth: 0, margin: "0 auto", boxSizing: "border-box"/);
});
