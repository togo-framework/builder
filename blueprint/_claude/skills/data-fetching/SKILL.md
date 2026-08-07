---
name: data-fetching
description: TanStack Query conventions for the web/ frontend — query keys, the queryOptions pattern, mutation hooks, cache invalidation, and imperative fetching. Use when writing or reviewing a query hook, a mutation hook, a keys file, or any component that loads data from {{api_base}}.
---

# Data fetching — TanStack Query conventions

All data in `web/` comes from `{{api_base}}` over HTTP, through TanStack Query.
**`web/` never opens a database connection.** The API is the boundary; there is no
shortcut around it that survives contact with a second deployment target.

Organise data code by domain:

```
web/data/<domain>/
  keys.ts                  query keys
  <domain>-query.ts        queryOptions + the private fetcher
  <domain>-update-mutation.ts
```

## Query keys

One `keys.ts` per domain. Array keys, `as const`, never inlined in a component.

```ts
export const orderKeys = {
  all: () => ['orders'] as const,
  list: (tenantId: string | undefined) => ['orders', tenantId, 'list'] as const,
  detail: (tenantId: string | undefined, id: string | undefined) =>
    ['orders', tenantId, id, 'detail'] as const,
}
```

Keys must be **hierarchical** — a broad prefix invalidates everything beneath it.
`['orders', tenantId, 'list']` lets you invalidate one tenant's lists without blowing
away every other tenant's cache. A flat key like `['orderList']` gives you exactly two
choices: invalidate nothing, or invalidate everything.

Every scoping variable that changes the response **must be in the key**. A key missing
the tenant id serves tenant A's data to tenant B on the second render. This is a
security bug, not a caching bug.

## The queryOptions pattern

Use `queryOptions` from `@tanstack/react-query`. It gives type safety and works with
both `useQuery()` and `queryClient.fetchQuery()`.

Rules:

- Export `XVariables`, `XData`, and `XError` types, prefixed with the domain
- The fetcher `getX(variables, signal?)` is **private** — not exported. Imperative
  callers use `queryClient.fetchQuery(xQueryOptions(...))`.
- The fetcher throws when required variables are missing
- The fetcher passes `signal` for cancellation
- Errors are normalised through one shared handler that throws — never returned
- Gate with `enabled` so the query does not fire before its variables exist
- Do **not** add extra parameters to `xQueryOptions` for one caller's benefit. Callers
  override by spreading: `{ ...xQueryOptions(vars), enabled: true }`

```ts
import { queryOptions } from '@tanstack/react-query'

import { orderKeys } from './keys'
import { get, handleError } from '@/data/fetchers'
import type { ResponseError } from '@/types'

export type OrdersVariables = { tenantId?: string }
export type OrdersError = ResponseError

async function getOrders({ tenantId }: OrdersVariables, signal?: AbortSignal) {
  if (!tenantId) throw new Error('tenantId is required')
  const { data, error } = await get('/v1/tenants/{tenantId}/orders', {
    params: { path: { tenantId } },
    signal,
  })
  if (error) handleError(error)   // throws
  return data
}

export type OrdersData = Awaited<ReturnType<typeof getOrders>>

export const ordersQueryOptions = ({ tenantId }: OrdersVariables) =>
  queryOptions({
    queryKey: orderKeys.list(tenantId),
    queryFn: ({ signal }) => getOrders({ tenantId }, signal),
    enabled: typeof tenantId !== 'undefined',
  })
```

The path strings and response types should come from the generated OpenAPI document
(`{{api_base}}/openapi.json`, produced by `togo generate`) rather than hand-written.
A hand-written interface is a copy of the contract that silently stops matching it.

## Using it in a component

```ts
const { data, isPending, isError, error } = useQuery(ordersQueryOptions({ tenantId }))
```

Render the states in order — pending, then error, then success. See
`web-best-practices`.

Use v5 flags precisely: `isPending` is "no data yet", `isFetching` is "a request is in
flight", including background refetches. Showing a full-page skeleton on `isFetching`
makes every background refresh look like a page reload.

## Imperative fetching

Outside React, or inside a callback:

```ts
const queryClient = useQueryClient()

const handleExport = useCallback(async () => {
  const data = await queryClient.fetchQuery(ordersQueryOptions({ tenantId }))
  // …
}, [tenantId, queryClient])
```

Never call the private fetcher directly — going around `fetchQuery` bypasses the cache,
deduplication, and error normalisation.

## Mutations

- Export a `Variables` type carrying scope, identifiers, and payload
- Private `updateX(vars)` with required-variable validation and the shared error handler
- `useXMutation()` accepts `UseMutationOptions` (minus `mutationFn`)
- Invalidate `list()` **and** `detail()` in `onSuccess`, awaited together
- Default to a toast on error when the caller supplies no `onError`

```ts
type UpdateOrderVariables = { tenantId: string; id: string; payload: OrderPayload }

export const useUpdateOrderMutation = ({
  onSuccess, onError, ...options
}: UseMutationOptions<OrdersData, OrdersError, UpdateOrderVariables> = {}) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateOrder,
    async onSuccess(data, variables, context) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orderKeys.detail(variables.tenantId, variables.id) }),
        queryClient.invalidateQueries({ queryKey: orderKeys.list(variables.tenantId) }),
      ])
      await onSuccess?.(data, variables, context)
    },
    async onError(error, variables, context) {
      if (onError === undefined) toast.error(`Failed to update order: ${error.message}`)
      else onError(error, variables, context)
    },
    ...options,
  })
}
```

**Await the invalidations.** An un-awaited `invalidateQueries` resolves the mutation
before the refetch starts, so the component that navigates on success arrives at a
screen still showing stale data.

Invalidate the **list** as well as the detail. Forgetting the list is the single most
common cache bug: the item updates, the table it came from does not, and the user
concludes the save failed.

## Optimistic updates

Only when the latency is genuinely user-visible. If you do:

- Cancel in-flight queries for the key first
- Snapshot the previous value and restore it in `onError`
- Always invalidate in `onSettled`, success or failure

An optimistic update without a rollback path shows the user a change that did not
happen. That is worse than a spinner.

## Anti-patterns

- Query keys inlined in components
- A scoping variable missing from the key
- `useEffect` + `fetch` + `useState` instead of a query
- `refetchInterval` used as a substitute for invalidation
- Disabling `staleTime` globally to "fix" stale data — find the missing invalidation
- Catching an error in the fetcher and returning `null`; the query then reports success
- Calling the private fetcher directly

## Related

- `web-best-practices` — the render-state contract
- `error-handling` — what happens to the error the fetcher throws
- `togo-generate` — where the OpenAPI types come from
