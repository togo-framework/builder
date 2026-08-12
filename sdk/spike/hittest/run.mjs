// Runs the clip-path hit-test spike on every engine we ship to.
//
// The gate is one assertion: with a full-viewport iframe clipped to a window
// region, does a point OUTSIDE that region hit the host page rather than the
// frame? If any engine says no, FeedbackOS cannot use a full-viewport overlay
// on that engine and `shell:"os"` must resolve to `"panel"` there.
// Imported by absolute path: this spike is deliberately NOT a dependency of
// sdk/package.json — it is scaffolding that gets deleted once the gate is
// answered, and adding playwright to the SDK's deps to run it once would be
// exactly the wrong trade. PW_MODULE points at any resolvable playwright.
const { chromium, firefox, webkit } = await import(process.env.PW_MODULE ?? "playwright");

const URL = process.env.SPIKE_URL ?? "http://localhost:8199/index.html";
const ENGINES = [
  ["chromium", chromium],
  ["firefox", firefox],
  ["webkit", webkit],
];

// iPhone 15 viewport + touch, to approximate mobile Safari. Not a substitute
// for a real device, and reported as such.
const MOBILE = {
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

const report = [];

for (const [name, engine] of ENGINES) {
  for (const [profile, opts] of [["desktop", {}], ["mobile", MOBILE]]) {
    // firefox does not support isMobile; skip that combination honestly
    // rather than reporting a pass for a run that never happened.
    if (name === "firefox" && profile === "mobile") {
      report.push({ engine: name, profile, skipped: "playwright firefox does not support isMobile" });
      continue;
    }
    let browser;
    try {
      browser = await engine.launch();
      const ctx = await browser.newContext(opts);
      const page = await ctx.newPage();
      await page.goto(URL, { waitUntil: "load" });
      await page.waitForFunction(() => window.__spike, null, { timeout: 10000 });
      const r = await page.evaluate(() => ({
        ua: navigator.userAgent,
        gatePassed: window.__spike.gatePassed,
        results: window.__spike.results,
      }));

      // REAL dispatched input. elementFromPoint is the standard proxy for
      // hit-testing, but the question that actually matters is whether a
      // user's click reaches the host page — so drive real mouse input.
      // Points are derived from the reported region by the page, so they are
      // valid at any viewport width.
      const pts = await page.evaluate(() => window.__points);
      await page.mouse.click(pts.OUT.x, pts.OUT.y);
      await page.mouse.click(pts.IN.x, pts.IN.y);
      const clicks = await page.evaluate(() => window.__clicks ?? []);
      // Outside the clip the host document must see the click. Inside it, the
      // event belongs to the frame's document, so the host must NOT see it.
      const near = (c, p) => Math.abs(c.x - p.x) <= 2 && Math.abs(c.y - p.y) <= 2;
      const outside = clicks.some((c) => near(c, pts.OUT));
      const inside = clicks.some((c) => near(c, pts.IN));
      r.results.push(
        { name: "real click OUTSIDE clip reaches host", pass: outside, detail: JSON.stringify(clicks) },
        { name: "real click INSIDE clip does not reach host", pass: !inside, detail: `host saw ${clicks.length} click(s)` },
      );
      r.gatePassed = r.gatePassed && outside && !inside;

      report.push({ engine: name, profile, ...r });
    } catch (err) {
      report.push({ engine: name, profile, error: String(err).split("\n")[0] });
    } finally {
      await browser?.close();
    }
  }
}

console.log(JSON.stringify(report, null, 2));

const ran = report.filter((r) => r.results);
const failed = ran.filter((r) => !r.gatePassed);
console.log("\n=== GATE SUMMARY ===");
for (const r of ran) {
  const bad = r.results.filter((x) => !x.pass).map((x) => x.name);
  console.log(
    `${r.engine}/${r.profile}: ${r.gatePassed ? "GATE PASS" : "GATE FAIL"} ` +
      `(${r.results.filter((x) => x.pass).length}/${r.results.length})` +
      (bad.length ? ` failing: ${bad.join(", ")}` : ""),
  );
}
for (const r of report.filter((x) => x.skipped)) console.log(`${r.engine}/${r.profile}: SKIPPED — ${r.skipped}`);
for (const r of report.filter((x) => x.error)) console.log(`${r.engine}/${r.profile}: ERROR — ${r.error}`);
console.log(failed.length ? `\n${failed.length} engine(s) FAILED the gate.` : "\nAll engines that ran passed the gate.");
