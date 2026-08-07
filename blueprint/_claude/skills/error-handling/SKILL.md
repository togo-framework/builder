---
name: error-handling
description: How errors are classified, surfaced, and made actionable — typed error classes thrown at the data layer, an O(1) lookup at the component layer, and inline troubleshooting. Use when rendering an API error in the UI, adding a new recognised error type, deciding what an endpoint should return on failure, or when a user sees a bare "Something went wrong".
---

# Error handling

Two halves that must not be confused: **the server decides what went wrong**, and
**the client decides what to show about it**. Neither guesses the other's job.

---

## Server side (Go)

**Return errors; do not swallow them.** A handler that logs an error and returns 200
with an empty list has converted a bug into silent data loss. The frontend renders an
empty state, the user assumes there is no data, and nobody finds out for a month.

Map failures to the status code that describes the *situation*, not the code that is
convenient:

| Situation | Status |
|---|---|
| Malformed request | 400 |
| Not authenticated | 401 |
| Authenticated, not permitted | 403 |
| Resource does not exist | 404 |
| Conflict with current state | 409 |
| Valid shape, invalid values | 422 |
| A required dependency is not ready (not a crash — nothing failed, the environment is not ready) | 424 |
| Something in this service broke | 500 |
| A downstream dependency broke | 502 / 503 |

That 424 distinction matters more than it looks: a service that returns 500 for
"the database is not migrated yet" sends the on-call engineer looking for a panic.

**Error bodies are structured and stable.** A machine-readable code, a human-readable
message, and — where it helps — the field that failed:

```json
{ "code": "order_already_shipped", "message": "This order has already shipped.", "field": null }
```

The `code` is the contract. The frontend switches on it. Change the `message` freely;
changing a `code` is a breaking API change, and it belongs in the OpenAPI document
(`togo generate`) so the frontend's generated types see it.

**Never leak internals.** SQL text, stack traces, table names, and connection strings
do not go in a response body. Log them with a correlation id; return the id.

**Fail at boot for structural problems.** A provider that cannot get its encryption key
must return an error from its registration function rather than continuing with a
broken subsystem — see `togo-plugin`. A boot that succeeds into a broken state defers
the failure to the worst possible moment.

---

## Client side (web/)

### The shape

Classification happens in the **data layer**, once. Rendering happens in the
**component layer**, with no pattern matching.

```
fetch → handleError() tests the response against the known patterns
      → throws a typed error subclass (e.g. ConnectionTimeoutError extends ResponseError)
      → TanStack Query catches it
      → the error component reads errorType and does an O(1) lookup
      → renders the matching troubleshooting UI
```

The component never runs a regex. If the component is matching on
`error.message.includes(...)`, the classification is in the wrong layer and will be
duplicated — inconsistently — in the next three components.

### The files

| File | Responsibility |
|---|---|
| `web/data/error-patterns.ts` | `{ pattern, ErrorClass }[]` — **the only place regexes live** |
| `web/types/api-errors.ts` | The error classes, the `KnownErrorType` union, the classified-error type |
| `web/components/ErrorMatcher.tsx` | Reads `errorType`, looks up the mapping, renders |
| `web/components/error-mappings.tsx` | `Record<KnownErrorType, { id, Troubleshooting }>` |
| `web/components/errorMappings/*.tsx` | One troubleshooting component per known error |

### Usage

Pass the **whole error object** through, never `error.message`:

```tsx
{isError && (
  <ErrorMatcher title="Failed to load orders" error={error} context={{ tenantId }} />
)}
```

Passing `error.message` throws away the class, which is the only thing that makes the
lookup possible. The component then falls back to the generic message and the whole
mechanism is inert.

### Adding a new recognised error

1. Add the class in `types/api-errors.ts`, extending the base response error, and add
   its literal to the `KnownErrorType` union
2. Add `{ pattern, ErrorClass }` to `data/error-patterns.ts` — prefer matching the
   server's stable `code` over its prose message
3. Add a troubleshooting component under `errorMappings/`
4. Register it in `error-mappings.tsx`
5. Test the classification as a pure function: given this response, that class

### What NOT to do

- Do not pass `error.message` to the error component — pass the error
- Do not put regexes in the mappings file — they belong in `error-patterns.ts`
- Do not stamp `errorType` onto a plain object; throw a real subclass
- Do not put the page title inside the mapping — the title belongs at the call site,
  because the same error means different things on different pages
- Do not add callback props (`onRetry`, `onOpenSupport`) to troubleshooting components;
  use hooks inside them, or every parent has to thread props it does not care about
- Do not `catch` in the query function and return `null` — the query then reports
  success with no data, and the empty state lies to the user

### What the user should see

Every error state needs three things: **what happened**, **what they can do**, and
**how to escalate**. A red box saying "Error" has none of them.

An error boundary is a backstop for the unanticipated, not a strategy. If a specific
failure is reaching the boundary regularly, it deserves a classified type and a
troubleshooting component.

## Logging

Structured, key-based, one event per failure. Include the correlation id you returned
to the client so a support conversation can be joined to a log line. Never log
credentials, tokens, or the contents of a request body that may carry them.

## Related

- `data-fetching` — the fetcher that calls the classifier
- `web-best-practices` — the four render states
- `telemetry` — errors worth counting, and the `_failed` event convention
