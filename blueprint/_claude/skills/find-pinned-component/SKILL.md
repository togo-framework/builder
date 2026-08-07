---
name: find-pinned-component
description: Resolve an issue's pin anchor — testid, CSS path, ARIA role plus accessible name, tag and ordinal, bounding-rect ratio, text hint — to the component in the source tree that renders it. Use when an issue carries a pin, when told "the user pointed at this element", or before fixing any UI bug reported through the in-app feedback widget.
---

# find-pinned-component — Resolve the pin, or refuse

A pin is what the reporter pointed at. It is a set of anchors captured in the browser
at report time, ordered from most durable to least:

| Field | Survives restyle? | Survives reorder? | Survives copy change? |
|---|---|---|---|
| `testid` | yes | yes | yes |
| `css_path` (`#id` fragment) | yes | usually | yes |
| `aria_role` + `aria_name` | yes | yes | **no** |
| `tag_name` + ordinal | no | **no** | yes |
| `rect_*` (viewport **fractions**) | no | no | yes |
| `text_hint` | yes | yes | **no** |

Also captured: `href` (the route), `scroll_y`, `viewport_w`/`viewport_h`, `dpr`, a
`dom_path_digest`, and `strategies_verified` — which strategies actually matched at
capture time.

The rect is stored as **viewport fractions, not pixels**, so it survives a window
resize. It does not survive a layout change, which is exactly what many UI bug fixes
are. Treat it as corroboration, never as identification.

---

## The fallback chain

Walk it **in order**. Stop at the first strategy that yields exactly one candidate,
then corroborate with the remaining signals.

### 1. `testid` — near-certain

```bash
rg -n 'data-testid=["'\'']<testid>["'\'']' web/
```

One hit → **exact**. Corroborate the route against `href` and move on.

Zero hits: the test id was removed or renamed since capture. Check history before
assuming it never existed:

```bash
git log -S'<testid>' --oneline -- web/ | head
```

A `git log -S` hit tells you which commit removed it and what replaced it — that is
usually the whole answer.

Multiple hits: the test id is not unique. Narrow by route (step 5), and file an issue
about the duplicate id — non-unique test ids break every downstream consumer.

### 2. `css_path` — strong if it carries an `#id`

Extract the id fragment and search for it:

```bash
rg -n 'id=["'\'']<the-id>["'\'']' web/
```

A stable, hand-authored `#id` is nearly as good as a test id. A generated id
(`:r3:`, `radix-:r7:`, a hash, a uuid) is **worthless** — it changes on every render.
Recognise those and skip straight to step 3.

The class-and-nth portion of a CSS path is the weakest thing in the pin. Do not search
on utility classes; every card in the app has the same ones.

### 3. `aria_role` + `aria_name` — strong, and semantic

The accessible name usually comes from visible text, an `aria-label`, or an associated
label element.

```bash
rg -n 'aria-label=["'\'']<aria_name>["'\'']' web/
rg -nF '<aria_name>' web/                     # visible text or a translation key
```

If `{{locales}}` declares more than one locale, the accessible name is probably a
**translated string**. Search the message catalogues for the value, get the key, then
search the source for the key:

```bash
rg -nF '<aria_name>' web/locales/ web/messages/ web/public/locales/
rg -n '<the.key>' web/
```

Cross-check the element type: `role="button"` should land on a `<button>` or a button
component, not a `<div>` — if it lands on a `div` with a click handler, you have found
both the component and an accessibility bug.

### 4. `text_hint` — corroborating, rarely identifying

Up to 120 characters of the element's text. Use the same catalogue-then-key path as
above. Text is brittle across copy edits and useless in the locale the reporter was
not using — corroborate with it, do not conclude from it.

### 5. Route scoping — always do this

`href` tells you which page was on screen. Map it to the file tree before you search
anything else; it turns a repo-wide grep into a directory-sized one.

```
/orders            → web/app/orders/page.tsx
/orders/abc-123    → web/app/orders/[id]/page.tsx
/settings/billing  → web/app/settings/billing/page.tsx
```

Then read outward: the page's imports, then its components' imports. A pin that
resolves to a component the page does not (transitively) import has **not** resolved.

### 6. `tag_name` + ordinal, and the rect — last resort, corroboration only

`nth-of-type` breaks the moment anyone reorders a list, and lists are reordered
constantly. The rect ratio tells you roughly where on the page the element sat:

- `rect_y < 0.15` with `scroll_y == 0` → header, nav, or page title
- `rect_x > 0.75` → a right-rail, a toolbar's trailing action, or a row's action menu
- `rect_w > 0.9` → a full-width container, likely the wrong granularity — the reporter
  probably meant something inside it
- Small `rect_w` and `rect_h` → an icon button, a badge, a chip

**These are hypotheses to test against candidates from steps 1–3, never a search
strategy of their own.** "It was in the top-right" narrows a list; it does not identify
a file.

---

## Scoring the result

| Confidence | Evidence |
|---|---|
| **exact** | Unique `testid` hit, or a unique stable `#id`, and the route is consistent |
| **fuzzy** | Unique role+name hit, route-consistent, and the rect is plausible |
| **watching** | Several candidates that the available signals cannot separate |
| **lost** | No strategy produced a route-consistent candidate |

Record which strategy resolved it and how many attempts it took. The anchors that keep
failing are data, not folklore — that telemetry is why pins are structured columns
rather than an opaque blob, and it is what tells you the codebase needs more test ids.

---

## Refuse rather than guess

**A low-confidence match must REFUSE.** Say what you found, say why it is not enough,
and hand back.

```
Pin resolution: LOW CONFIDENCE — not proceeding.

Anchors:  testid="" · aria_role="button" · aria_name="Delete"
          text_hint="Delete" · rect=(0.82, 0.31, 0.04, 0.03) · href=/orders

Found:    11 components rendering a button with the accessible name "Delete".
          3 are reachable from /orders:
            web/components/OrdersTable/RowActions.tsx:44
            web/components/BulkBar.tsx:19
            web/app/orders/[id]/DangerZone.tsx:31

Cannot separate them: the rect (right side, mid-page, icon-sized) is consistent with
both RowActions and BulkBar.

Need one of:
  - which order row / which state the page was in
  - a screenshot attachment
  - a data-testid added to these three components (worth doing regardless)
```

**Why refusing is the correct behaviour, not a failure:** a confident fix to the wrong
"Delete" button ships a change nobody asked for, leaves the reported bug live, and —
because it looked resolved — the reporter is told it is fixed. The next report is
"you broke bulk delete and my original bug is still there". An honest refusal costs one
round trip; a wrong confident match costs two bugs and the reporter's trust.

Refuse when **any** of these holds:

- No strategy produced a unique, route-consistent candidate
- The best candidate is a full-width container (wrong granularity)
- The only signal is `text_hint` or the rect
- The candidates are in different features and the fix would differ between them
- `strategies_verified` shows the durable strategies did **not** match at capture time —
  the pin was weak when it was taken

---

## After a resolution — leave it better

Whenever you resolve a pin the hard way, add a `data-testid` to the element you
resolved to, in the same PR. It costs one attribute and makes every future pin on that
element exact. It also makes the element addressable from `e2e-tests`.

Naming: `<feature>-<element>-<role>` — `orders-row-delete`, `billing-plan-upgrade`.
Stable, unique, and not derived from copy.

## Related

- `issue-fix` — the loop that calls this before reproducing
- `e2e-tests` — test ids serve both purposes
- `web-best-practices` — component structure, which decides how findable things are
