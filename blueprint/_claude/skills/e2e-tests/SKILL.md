---
name: e2e-tests
description: Write, run, and debug Playwright end-to-end tests — selectors, race conditions, waiting strategies, helpers, cleanup, and CI-versus-local differences. Use when asked to run e2e tests, add a new E2E spec, or debug a flaky test that passes locally and fails in CI.
---

# E2E tests — Playwright

```bash
npx playwright test                              # everything
npx playwright test features/orders.spec.ts      # one file
npx playwright test --grep "creates an order"    # by name
npx playwright test --ui                         # interactive debugging
npx playwright test --headed --workers=1         # watch it happen, serially
```

Generate a starting spec for a resource with `togo make:e2e <Model>`, then make it
real — a generated smoke test is a scaffold, not coverage.

## Selector priority — best to worst

1. **`getByRole` with an accessible name.** Most robust, and it tests accessibility
   as a side effect.
   ```ts
   page.getByRole('button', { name: 'Save' })
   page.getByRole('button', { name: 'Configure API privileges' })
   ```
2. **`getByTestId`.** Stable, explicit, immune to copy changes.
   ```ts
   page.getByTestId('orders-side-panel')
   ```
3. **`getByText` with `exact: true`.** Fine for genuinely unique text.
4. **`locator` with CSS.** Sparingly. Fragile.

### Never

```ts
locator('xpath=ancestor::div[contains(@class, "space-y")]')  // breaks on any DOM change
element.locator('..').getByRole('button')                    // parent traversal
popover.getByRole('combobox')                                // may match several
```

If a component has no good accessible name, **add one in the source**:

```tsx
<Button aria-label="Configure API privileges"><Settings /></Button>
```

That fixes the test and fixes screen-reader users at the same time. A `data-testid`
added for a test is also what makes an issue's **pin anchor** resolvable later — see
`find-pinned-component`. Test ids are infrastructure, not test debt.

### Narrow the scope

```ts
const panel = page.getByTestId('orders-side-panel')
await panel.getByRole('switch').click()
```

## Race conditions — the number one source of flake

**Set the waiter up before you trigger the action.**

```ts
// ❌ the response can land before the waiter exists
await page.getByRole('button', { name: 'Save' }).click()
await page.waitForResponse((r) => r.url().includes('/v1/orders'))

// ✅
const saved = page.waitForResponse((r) => r.url().includes('/v1/orders') && r.request().method() === 'POST')
await page.getByRole('button', { name: 'Save' }).click()
await saved
```

Same before navigation:

```ts
const loaded = page.waitForResponse((r) => r.url().includes('/v1/orders'))
await page.goto('/orders')
await loaded
```

When one action fires several requests, wait for all of them:

```ts
const created = page.waitForResponse((r) => r.url().includes('/v1/orders') && r.request().method() === 'POST')
const listed  = page.waitForResponse((r) => r.url().includes('/v1/orders') && r.request().method() === 'GET')
await page.getByRole('button', { name: 'Save' }).click()
await Promise.all([created, listed])
```

## Waiting

Playwright auto-waits for actionability. Prefer that over anything manual.

```ts
await expect.poll(async () => await page.getByLabel('Delete order').count()).toBe(0)
await page.waitForSelector('[data-testid="side-panel"]', { state: 'detached' })
```

**Never `waitForTimeout`** as a synchronisation mechanism. Wait for something specific:

```ts
// ❌
await page.waitForTimeout(1000)
// ✅
await expect(page.getByText('Order created')).toBeVisible()
```

The only acceptable use is a known client-side debounce:

```ts
await page.getByRole('textbox').fill('search term')
await page.waitForTimeout(300) // debounce
```

**Avoid `networkidle`.** It is slow, and on a page with polling or a websocket it never
fires. Wait for the specific response.

## Never `force: true`

```ts
// ❌ hides the real problem
await menuButton.click({ force: true })
// ✅ make it visible the way a user would
await row.hover()
await expect(menuButton).toBeVisible()
await menuButton.click()
```

A forced click passes while the element is invisible to real users.

## Assertions

Always attach a message. Failures happen in CI, at night, to someone else.

```ts
// ❌
await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()
// ✅
await expect(
  page.getByRole('button', { name: 'Save' }),
  'Save should be visible once the form is filled'
).toBeVisible()
```

Explicit timeouts for genuinely slow operations:

```ts
await expect(page.getByText('Import complete'), 'import finishes').toBeVisible({ timeout: 50_000 })
```

## Structure

- Specs in `e2e/features/*.spec.ts`, helpers in `e2e/utils/`
- Extract repeated interactions into domain helpers — `e2e/utils/order-helpers.ts`
- Serial mode when tests share database state:
  ```ts
  test.describe.configure({ mode: 'serial' })
  ```
- Dismiss toasts before interacting; they overlay buttons and produce a "click
  intercepted" failure that reads like a selector bug:
  ```ts
  const closers = page.getByRole('button', { name: 'Close toast' })
  for (let i = 0; i < await closers.count(); i++) await closers.nth(i).click()
  ```

## Cleanup

Clean in `beforeAll`/`beforeEach`, not only in `afterAll` — an aborted run leaves
residue, and the next run must cope. Check before deleting:

```ts
const row = page.getByRole('row').filter({ hasText: name })
if ((await row.count()) === 0) return
// …delete
```

Use `try/finally` for resources created mid-test. Reset local storage after tests that
modify it.

## API mocking

```ts
await page.route('**/v1/reports*', (route) => route.fulfill({ body: JSON.stringify(mockReports) }))
```

Mock third-party and slow-and-irrelevant calls. **Do not mock the endpoint under
test** — an E2E test against a mocked API is a component test with a browser tax.

## CI versus local — cold start versus warm state

This is why "it passes locally" happens.

- **CI** runs from a blank slate: fresh database, migrations applied, seed data only.
  Optional extensions and feature flags are off unless the test enables them.
- **Local** against a long-running dev server has state from every previous run —
  rows you created by hand, flags you toggled, extensions you enabled.

Common cold-start failures:

1. A prerequisite (extension, feature flag, seeded row) that exists locally and not in CI
2. Parallel tests racing on shared state → `mode: 'serial'`
3. Locators matching a different element because the page renders an empty state in CI

Reproduce CI locally by resetting the database before the run — `togo db:down && togo
db:up && togo migrate && togo seed` — and running the suite cold.

## Debugging

```bash
npx playwright show-report
npx playwright show-trace test-results/<path>/trace.zip
npx playwright test --debug --grep "the failing test"
```

Read the trace before changing the test. The trace shows the DOM at the moment of
failure, which almost always reveals that the element was there but overlaid, or gone
because the request 401'd. Changing selectors until it goes green fixes nothing.

## Debugging workflow for a CI failure

1. Run it locally **cold** (reset database first)
2. Read the trace and the error context in `test-results/`
3. If you need live DOM inspection, run the dev server — remembering its state differs
   from CI
4. Fix the cause. A `waitForTimeout` added to make CI pass is a deferred failure.

## Related

- `testing-strategy` — deciding whether this should be an E2E test at all
- `find-pinned-component` — test ids are what make pins resolvable
- `verify` — E2E is the browser-side behavioural assertion
