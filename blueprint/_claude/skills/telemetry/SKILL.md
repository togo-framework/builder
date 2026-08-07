---
name: telemetry
description: Event tracking standards — naming, property conventions, what not to track, and the typed event definition workflow. Use when adding analytics to a new interaction, reviewing a PR that touches tracking, or deciding whether an event is worth firing at all.
---

# Telemetry standards

Every event costs something: a line of code, a row in a warehouse, and a slot in the
mental index of whoever reads the dashboard. Events that no one will act on are not
free — they dilute the ones that matter.

## Event naming

**Format:** `[object]_[verb]`, snake_case.

**Approved verbs — this list is the whole list:**

```
opened, closed, clicked, submitted, created, updated, removed, added,
enabled, disabled, copied, applied, completed, converted, sent, moved,
intended, evaluated, exposed, failed
```

Flag anything else. `saved`, `viewed`, `seen`, `pressed`, `loaded` are not approved —
each has an approved equivalent that is more precise.

| Wrong | Right | Why |
|---|---|---|
| `click_product_card` | `product_card_clicked` | verb last |
| `productCardClicked` | `product_card_clicked` | snake_case |
| `database_saved` | `save_button_clicked` or `database_updated` | `saved` is ambiguous — did the user click, or did it persist? |
| `dashboard_viewed` | *(don't track)* | passive; pageviews already cover it |
| `component_rendered` | *(don't track)* | no user interaction |

Good: `order_created`, `export_button_clicked`, `filter_applied`,
`connection_string_copied`.

## Property standards

**Casing:** camelCase for new events. When adding a property to an **existing** event,
match whatever convention that event already uses — a single event with mixed casing is
worse than a codebase with two conventions.

**Names must be self-explanatory at the dashboard, not at the call site:**

```ts
{ productType: 'database', planTier: 'pro' }      // ✅
{ label: 'db', value: 2 }                          // ❌ meaningless in six months
```

Flag: generic names (`label`, `value`, `name`, `data`, `type`), PascalCase properties,
and names inconsistent with the same concept on a sibling event (`assistantType` here,
`aiType` there — pick one).

**Never put PII in a property.** No emails, names, IP addresses, free-text the user
typed, or anything derived from them. If you need to segment by user, use the id the
analytics layer already carries.

**Bound the cardinality.** A property whose value is a free-form string or a raw id
produces a dimension with a million values and no dashboard. Bucket it.

## What not to track

- Passive views and renders on page load (`dashboard_viewed`, `sidebar_appeared`,
  `page_loaded`) — pageview tracking already covers these
- Component appearances with no user interaction
- Generic "viewed"/"seen" events

**Do track:** clicks, form submissions, explicit opens and closes, completions,
abandonments, and user-initiated failures.

**The one exception:** `*_exposed` events for experiment exposure are valid even though
they fire on render — exposure is the measurement.

## The required pattern

Use the project's tracking hook. One import, one call, typed.

```tsx
import { useTrack } from '@/lib/telemetry'

const ExportButton = () => {
  const track = useTrack()

  const handleClick = () => {
    track('export_button_clicked', {
      exportFormat: 'csv',
      rowCountBucket: '100-1k',
      source: 'orders_table',
    })
    // …
  }

  return <button onClick={handleClick}>Export</button>
}
```

Track in the **handler**, not in an effect. An effect fires on mount, on remount, and
on every dependency change — which is how one click becomes four events.

## Event definitions are typed

Every event is declared as an interface in the shared telemetry constants module, then
added to the `TelemetryEvent` union so the hook accepts it. An event that is not
declared does not compile — that is the point.

```ts
/**
 * Fired when a user exports the current table view.
 *
 * @group Events
 * @source The Export button in the orders table toolbar
 */
export interface ExportButtonClickedEvent {
  action: 'export_button_clicked'
  properties: {
    /** File format chosen in the export dialog */
    exportFormat: 'csv' | 'json' | 'xlsx'
    /** Bucketed row count — never the raw number */
    rowCountBucket: string
    /** Which surface the export was initiated from */
    source: string
  }
}
```

`@source` must be **accurate**. A wrong `@source` is worse than none: it sends the next
person to the wrong component when the numbers look strange.

## Errors

Failures are worth counting when the user experienced them. Use the `failed` verb and
carry the **classified error code**, never the raw message:

```ts
track('order_submit_failed', { errorCode: 'order_already_shipped', retryCount: 1 })
```

Raw messages are unbounded-cardinality free text and frequently contain user input.
See `error-handling` for where the code comes from.

## Reviewing a PR

Flag these as required changes:

1. **Naming** — not `[object]_[verb]`, not snake_case, or an unapproved verb
2. **Properties** — wrong casing, generic names, inconsistent with sibling events,
   unbounded cardinality
3. **PII** in any property
4. **Passive tracking** — an event that fires without a user action
5. **Undeclared event** — not in the constants module, or missing from the union
6. **Inaccurate `@source`**
7. **Tracking inside an effect** where a handler was available

When a PR adds a user-facing interaction (button, form, toggle, modal) with **no**
tracking, do not demand it — suggest it:

> This adds a user interaction that may be worth tracking. Suggested:
> `export_button_clicked` with `{ exportFormat, source }`.

Then check the constants module for a sibling event and match its property names.

## Verification checklist

- [ ] `[object]_[verb]`, snake_case, approved verb
- [ ] Properties camelCase (or matching the existing event) and self-explanatory
- [ ] Cardinality bounded
- [ ] No PII
- [ ] Declared in the constants module with accurate `@source`, added to the union
- [ ] Fired from a handler, not an effect
- [ ] Not a passive view

## Related

- `error-handling` — where `errorCode` comes from
- `web-best-practices` — handler naming and placement
