#!/usr/bin/env node
/*
 * Postinstall: fetch the prebuilt `togo-builder` binary for this platform and
 * VERIFY IT against the release's checksums.txt before it is ever executed.
 *
 * The checksum step is the point. togo's own CLI installer downloads a binary
 * over the network and runs it with no verification at all — a compromised
 * release asset, or a MITM on a network that strips TLS, executes silently.
 * Downloading is unavoidable; trusting it blindly is not.
 *
 * Never hard-fails the npm install: a missing binary is reported at run time by
 * the bin shims, so a CI job that only needs the JS does not break.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { version } = require("./package.json");

const PLAT = { darwin: "darwin", linux: "linux", win32: "windows" }[process.platform];
const ARCH = { x64: "amd64", arm64: "arm64" }[process.arch];
const binDir = path.join(__dirname, "bin");
const binName = PLAT === "windows" ? "togo-builder.exe" : "togo-builder";
const REPO = "togo-framework/builder";

if (!PLAT || !ARCH) {
  console.error(
    `[builder] no prebuilt binary for ${process.platform}/${process.arch}\n` +
    `          install from source: go install github.com/${REPO}/cmd/togo-builder@v${version}`);
  process.exit(0);
}

const ext = PLAT === "windows" ? "zip" : "tar.gz";
const asset = `togo-builder_${PLAT}_${ARCH}.${ext}`;
const base = `https://github.com/${REPO}/releases/download/v${version}`;

function fetch(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
        res.resume();
        return resolve(fetch(res.headers.location, dest, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      if (dest === null) {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve(body));
        return;
      }
      const f = fs.createWriteStream(dest);
      res.pipe(f);
      f.on("finish", () => f.close(() => resolve(dest)));
      f.on("error", reject);
    }).on("error", reject);
  });
}

const sha256 = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

/** Pull the expected digest for our asset out of goreleaser's checksums.txt. */
function expectedDigest(text, name) {
  for (const line of text.split("\n")) {
    const [hash, file] = line.trim().split(/\s+/);
    if (file === name || file === `./${name}`) return hash;
  }
  return null;
}

(async () => {
  fs.mkdirSync(binDir, { recursive: true });
  const archive = path.join(binDir, asset);
  try {
    // Checksums FIRST: if the manifest is unavailable there is nothing to
    // verify against, and installing an unverifiable binary is the thing we are
    // trying to avoid.
    const sums = await fetch(`${base}/checksums.txt`, null);
    const want = expectedDigest(sums, asset);
    if (!want) throw new Error(`${asset} is not listed in checksums.txt`);

    await fetch(`${base}/${asset}`, archive);
    const got = sha256(archive);
    if (got !== want) {
      fs.rmSync(archive, { force: true });
      throw new Error(
        `checksum mismatch for ${asset}\n  expected ${want}\n  got      ${got}\n` +
        `  the download was corrupted or tampered with — refusing to install it`);
    }

    // System tar handles both .tar.gz and .zip (Windows 10+ ships bsdtar).
    execFileSync("tar", ["-xf", archive, "-C", binDir, binName], { stdio: "ignore" });
    fs.rmSync(archive, { force: true });
    if (PLAT !== "windows") fs.chmodSync(path.join(binDir, binName), 0o755);
    console.log(`[builder] installed ${binName} v${version} (sha256 verified)`);
  } catch (e) {
    fs.rmSync(archive, { force: true });
    console.error(`[builder] prebuilt install failed: ${e.message}`);
    console.error(`[builder] falling back to 'go install'…`);
    try {
      execFileSync("go", ["install", `github.com/${REPO}/cmd/togo-builder@v${version}`],
        { stdio: "inherit", env: { ...process.env, GOBIN: binDir } });
      console.log("[builder] installed via go install");
    } catch {
      console.error(
        `[builder] could not install the binary.\n` +
        `          Install Go and run: go install github.com/${REPO}/cmd/togo-builder@v${version}`);
    }
  }
})();
