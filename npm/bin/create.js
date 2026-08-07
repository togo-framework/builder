#!/usr/bin/env node
/*
 * `npx create-togo-builder acme` → `togo-builder new acme`.
 *
 * The `new` verb is prepended so the npx form reads naturally. Without it the
 * user would have to type `npx create-togo-builder new acme`, which nobody does.
 */
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const bin = path.join(__dirname,
  process.platform === "win32" ? "togo-builder.exe" : "togo-builder");

if (!fs.existsSync(bin)) {
  console.error(
    "[builder] the binary is missing — the postinstall step did not complete.\n" +
    "          Install Go and run: go install github.com/togo-framework/builder/cmd/togo-builder@latest");
  process.exit(1);
}

const args = process.argv.slice(2);
// Only prepend when the user did not already name a verb.
const verbs = new Set(["new", "doctor", "seed", "version", "help", "--help", "-h"]);
if (args.length === 0 || !verbs.has(args[0])) args.unshift("new");

process.exit(spawnSync(bin, args, { stdio: "inherit" }).status ?? 1);
