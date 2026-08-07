#!/usr/bin/env node
/* Thin shim: hand every argument to the real binary and mirror its exit code. */
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const bin = path.join(__dirname,
  process.platform === "win32" ? "togo-builder.exe" : "togo-builder");

if (!fs.existsSync(bin)) {
  console.error(
    "[builder] the binary is missing — the postinstall step did not complete.\n" +
    "          Reinstall, or: go install github.com/togo-framework/builder/cmd/togo-builder@latest");
  process.exit(1);
}
process.exit(spawnSync(bin, process.argv.slice(2), { stdio: "inherit" }).status ?? 1);
