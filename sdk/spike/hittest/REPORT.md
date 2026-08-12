# Spike: does clip-path exclude a region from iframe hit-testing?

**Date:** 2026-08-12  ·  **Task:** #11  ·  **Verdict: PASS on every engine tested**

The question the whole windowed architecture rests on: with a full-viewport
iframe clipped to a window region, do pointer events OUTSIDE that region reach
the host page? If any engine said no, a FeedbackOS overlay would eat every
click on the customer site and `shell:"os"` would have to fall back to panel.

`CSS.supports("clip-path", 'path("M0 0")')` was deliberately NOT used as the
test — it checks whether the value PARSES, not whether hit-testing honours it.
It is recorded as a reference row only.

## Host page hostility

- a `transform` ancestor (creates a containing block for fixed positioning)
- a scroll container
- the host's own `z-index: 2147483647` fixed element (ours sits at 2147483000)

## Results

```
=== GATE SUMMARY ===
chromium/desktop: GATE PASS (10/10)
chromium/mobile: GATE PASS (10/10)
firefox/desktop: GATE PASS (10/10)
webkit/desktop: GATE PASS (10/10)
webkit/mobile: GATE PASS (10/10)
firefox/mobile: SKIPPED — playwright firefox does not support isMobile

All engines that ran passed the gate.
```

## Caveats, stated plainly

- WebKit via Playwright is a close proxy for Safari, not Safari itself.
- Playwright's mobile profile is emulation, not a real iOS device.
- Firefox mobile was skipped, not passed — Playwright firefox rejects isMobile.

Real-device Safari/iOS confirmation is still worth doing before Phase 1 ships,
but nothing here suggests the approach is engine-limited.
