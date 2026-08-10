// Make the SHARED source tree resolvable.
//
// web/src is a symlink to blueprint/_project/web/src — the one copy of the 23
// screens, which the scaffolder also stamps into every generated project. That
// is the point: the plugin builds the same files the blueprint ships, so a fix
// to a screen lands in the embedded dashboard and in every scaffolded app at
// once, with no third mirror to keep in step.
//
// The cost of sharing is resolution. Node, Vite and Tailwind all resolve from
// the REAL location of a file, not from the symlink that pointed at it, so
// every `import { … } from "react"` inside blueprint/_project/web/src walks up
// from blueprint/_project/web/ and never reaches web/node_modules. Same for
// Tailwind's `@source "../node_modules/@togo-framework/ui/dist"` in app.css,
// which resolves against the directory app.css actually lives in.
//
// So: put a node_modules THERE, as a link to the one this project installed.
// A link rather than a second install — two copies of React in one bundle is a
// class of bug that shows up as hooks throwing at run time, and the whole
// reason this file exists is that there is exactly one of everything.
//
// Idempotent, and a no-op once correct: it runs on every build so a fresh
// clone or a re-install cannot leave the tree half-wired.
import { existsSync, lstatSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ours = join(here, "node_modules");
const theirs = resolve(here, "../blueprint/_project/web/node_modules");

if (!existsSync(ours)) {
  console.error(
    "web/node_modules is missing — run `pnpm install` in web/ before building.",
  );
  process.exit(1);
}

// A real directory here would be a second install, and silently the wrong one.
// Refuse rather than delete somebody's tree.
if (existsSync(theirs) && !lstatSync(theirs).isSymbolicLink()) {
  console.error(
    `${theirs} exists and is not a link.\n` +
      "Remove it: the blueprint is a template, not an installed project.",
  );
  process.exit(1);
}

const want = relative(dirname(theirs), ours);
const have = lstatSync(theirs, { throwIfNoEntry: false })?.isSymbolicLink()
  ? readlinkSync(theirs)
  : null;

if (have === want) process.exit(0);

if (have !== null) rmSync(theirs);
symlinkSync(want, theirs, "dir");
console.log(`linked blueprint/_project/web/node_modules → ${want}`);
