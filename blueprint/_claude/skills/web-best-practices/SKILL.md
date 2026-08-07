---
name: web-best-practices
description: React and TypeScript conventions for the web/ frontend — boolean naming, component structure, loading and error states, state management, custom hooks, event handlers, conditional rendering, performance, and TypeScript discipline. Use when writing or reviewing anything under web/, or when a component is getting long, tangled, or hard to test.
---

# Web best practices

Applies to `web/**/*.{ts,tsx}` in {{project_name}}.

**The boundary first:** `web/` is the frontend. It talks to `{{api_base}}` over HTTP
and to nothing else. It **never** opens a database connection — not from a server
component, not from a route handler, not "just for this one query". If a page needs
data the API does not expose, add the endpoint (`togo-resource`), do not reach past it.

## Boolean naming

Use descriptive prefixes, and derive rather than store:

- `is` — state or identity: `isLoading`, `isPaused`, `isNewRecord`
- `has` — possession: `hasPermission`, `hasData`
- `can` — capability: `canEditRow`, `canDelete`
- `should` — conditional behaviour: `shouldFetch`, `shouldRender`

Extract complex conditions into a named variable:

```tsx
// ❌ inline multi-condition — nobody can name what this means
{!isLocked && isEditable(selected) && canEditRow && !isLoading && <Button />}

// ✅ named
const canShowEditButton = !isLocked && isEditable(selected) && canEditRow && !isLoading
{canShowEditButton && <Button />}
```

Derive booleans; do not mirror them into state:

```tsx
// ❌ stored derived state — one render behind, forever
const [isFormValid, setIsFormValid] = useState(false)
useEffect(() => { setIsFormValid(name.length > 0 && email.includes('@')) }, [name, email])

// ✅ derived
const isFormValid = name.length > 0 && email.includes('@')
```

## Component structure

Keep components under roughly 200–300 lines. Split when you see:

- Multiple distinct UI sections
- Complex conditional rendering
- Several unrelated `useState` calls
- You cannot tell what it does at a glance

Co-locate sub-components in the same directory as the parent. **No barrel / index
re-export files** — import directly from the file that defines the thing. Barrels
create import cycles, defeat tree-shaking, and hide where code actually lives.

Extract repeated JSX into small components rather than into a `renderX()` method.

## Data fetching

All data fetching goes through TanStack Query. See `data-fetching` for query and
mutation conventions, and `error-handling` for how errors reach the screen.

### Loading / error / success

Top level — early returns, not nested ternaries:

```tsx
const { data, error, isPending, isError, isSuccess } = useQuery(...)

if (isPending) return <SkeletonLoader />
if (isError) return <ErrorState error={error} subject="Failed to load orders" />
if (isSuccess && data.length === 0) return <EmptyState />
return <OrdersTable rows={data} />
```

Inline, when the surrounding chrome must stay mounted:

```tsx
<div>
  {isPending && <InlineLoader />}
  {isError && <InlineError error={error} />}
  {isSuccess && data.length === 0 && <EmptyState />}
  {isSuccess && data.length > 0 && <OrdersTable rows={data} />}
</div>
```

**Every one of the four states must be handled.** A component with a loading state and
no empty state ships a blank rectangle to the first user with no data.

## State management

Keep state as local as possible; lift only when a second component genuinely needs it.

Group related form state in a form library rather than a pile of `useState`:

```tsx
// ❌ five useState calls that are one object
const [name, setName] = useState('')
const [email, setEmail] = useState('')

// ✅ one form
const form = useForm<FormValues>({ defaultValues: { name: '', email: '' } })
```

## Custom hooks

Extract complex or reusable logic into hooks. Return **objects, not arrays** — an array
return cannot gain a third member without breaking every call site:

```tsx
// ❌
return [value, toggle]
// ✅
return { value, toggle, setTrue, setFalse }
```

## Event handlers

- Prop callbacks: `on` prefix — `onClose`, `onSave`
- Internal handlers: `handle` prefix — `handleSubmit`, `handleCancel`

Use `useCallback` for handlers passed to memoised children. Do not wrap every handler
reflexively; an unmemoised handler passed to a plain DOM element costs nothing.

## Conditional rendering

```tsx
<>{isVisible && <Component />}</>          // show / hide
<>{isPending ? <Spinner /> : <Content />}</> // binary
```

Three or more branches → early returns. Never nest ternaries.

## Performance

`useMemo` for computations you have **measured** as expensive, or for values passed to
memoised children. Wrapping everything in `useMemo` makes the code harder to read and
measurably slower — every memo has a cost.

## Internationalisation

This project's locales are `{{locales}}`. If more than one is declared:

- No user-facing string literals in components — everything through the translation layer
- Layout must survive a text direction flip; do not hard-code `left`/`right` where
  `start`/`end` exist
- Dates, numbers, and currency go through the locale-aware formatter, never
  `toLocaleString()` with a hard-coded locale

## TypeScript

Define prop interfaces explicitly. Use discriminated unions for state that has modes:

```tsx
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error }
```

Avoid `as any` and `as Type`. Validate at the boundary instead:

```tsx
// ❌ a cast is a promise you made to the compiler and cannot keep
const user = apiResponse as User

// ✅ parse
const user = userSchema.parse(apiResponse)
const result = userSchema.safeParse(apiResponse)
```

The API's shape is knowable — `{{api_base}}/openapi.json` is generated from the
compiled server. Prefer types generated from that document over hand-written
interfaces that drift.

## Testing

Push logic out of components into pure functions in co-located `.utils.ts` files, then
test those exhaustively. See `testing-strategy`.

## Related

- `data-fetching` — query and mutation conventions
- `error-handling` — rendering API errors
- `testing-strategy` — what kind of test to write
- `telemetry` — event tracking conventions
