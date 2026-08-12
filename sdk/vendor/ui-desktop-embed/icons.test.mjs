// Every icon name the shell references must exist in the inlined set.
//
// Icon returns null for an unknown name, which is the right runtime behaviour —
// a missing glyph must never throw inside somebody's page — but it means a typo
// or a glyph nobody added renders as NOTHING, silently, and looks like a
// layout bug. This catches it at test time instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sdk = join(here, "..", "..");

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === "dist" || e === "spike") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

test("every referenced glyph is in the inlined set", () => {
  const icons = readFileSync(join(here, "icons.tsx"), "utf8");
  const known = new Set([...icons.matchAll(/^ {2}([A-Za-z0-9]+): \[/gm)].map((m) => m[1]));
  assert.ok(known.size > 30, `only found ${known.size} glyphs — did the file format change?`);

  const missing = [];
  for (const file of walk(join(sdk, "src")).concat(walk(join(sdk, "vendor")))) {
    if (file.endsWith("icons.tsx")) continue;
    const src = readFileSync(file, "utf8");
    // <Icon name="Foo" />  and  name: "Foo"  in an icon position
    for (const m of src.matchAll(/<Icon\s+name="([A-Za-z0-9]+)"/g)) {
      if (!known.has(m[1])) missing.push(`${m[1]} (${file.replace(sdk + "/", "")})`);
    }
    for (const m of src.matchAll(/icon:\s*"([A-Z][A-Za-z0-9]+)"/g)) {
      if (!known.has(m[1])) missing.push(`${m[1]} (${file.replace(sdk + "/", "")})`);
    }
  }
  assert.deepEqual(
    missing,
    [],
    "these glyph names are referenced but not inlined — they render as NOTHING:\n  " +
      missing.join("\n  ") +
      "\n\nAdd them to vendor/ui-desktop-embed/icons.tsx (regenerate from lucide).",
  );
});
