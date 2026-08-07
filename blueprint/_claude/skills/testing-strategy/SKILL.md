---
name: testing-strategy
description: Decide what kind of test to write and where the logic under test should live — Go tests, pure-function unit tests, component tests, and E2E. Use when writing new tests, when a component is hard to test, when extracting logic to make it testable, or when reviewing whether coverage is sufficient.
---

# Testing strategy

The core principle: **push logic out of the hard-to-test place into the easy-to-test
place, then test it exhaustively.** A component test that exists only because a
calculation lives inside a component is a test of the wrong thing at the wrong cost.

## The decision tree

```
Is it server-side behaviour (handler, action, query)?
  YES → Go test.  Is the logic pure?
          YES → table-driven unit test, no database
          NO  → feature test against a real database (TEST_DATABASE_URL)
  NO  → Is it a pure transformation (parse, format, validate, compute)?
          YES → extract to a .utils.ts, unit test it
          NO  → Does it involve complex UI interaction?
                  YES → Is the flow user-critical or cross-surface?
                          YES → E2E (see `e2e-tests`)
                          NO  → component test
                  NO  → can you extract it to make it pure?
                          YES → do that, then unit test
                          NO  → component test
```

## Go — server side

```bash
togo test                 # go test ./...
togo test ./internal/api  # one package
TEST_DATABASE_URL=… togo test    # required for database-backed tests
```

**Table-driven tests** are the default shape. One test function, a slice of named
cases, each with inputs and expected output. Adding the eleventh case must cost one
line, not one function.

**Test the Action, not the controller.** Business logic belongs in `internal/actions/`
precisely so it can be tested without an HTTP request. If you find yourself spinning up
a router to test a calculation, the calculation is in the wrong place — see
`togo-resource`.

**Do not test generated code.** `*.gen.go` is sqlc's output and sqlc's responsibility.
Test *your* queries by exercising them against a real database, which tests the SQL —
the thing that can actually be wrong.

**Feature tests use a real database.** Mocking the database layer tests your mock.
Use a scratch database, apply migrations, seed with factories (`togo make:factory`),
and clean up. A test that requires a hand-prepared database is a test nobody will run.

**Test the denial path.** Every authorization check needs a test that it *denies*.
togo's `Can()` is an exact string match, so a permission set that looks permissive can
deny everything — a test that only ever asserts the allowed case will pass against a
completely broken authorization layer.

## Frontend — extract logic into `.utils.ts`

Remove as much logic from components as possible. Put it in a co-located `.utils.ts`
file as a pure function: arguments in, return value out.

Naming: `ComponentName.utils.ts` next to the component; the test mirrors the source
path.

```tsx
// ❌ logic buried in a component — untestable without rendering
function TaxIdForm({ value, name }: Props) {
  const handleSubmit = () => {
    const spec = TAX_IDS.find((t) => t.name === name)
    let sanitised = value
    if (spec?.prefix && !value.startsWith(spec.prefix)) sanitised = spec.prefix + value
    submit(sanitised)
  }
  return <form onSubmit={handleSubmit}>…</form>
}

// ✅ extracted — trivially testable
// TaxId.utils.ts
export function sanitiseTaxId({ value, name }: { value: string; name: string }): string {
  const spec = TAX_IDS.find((t) => t.name === name)
  if (spec?.prefix && !value.startsWith(spec.prefix)) return spec.prefix + value
  return value
}

// TaxIdForm.tsx — a thin shell
const handleSubmit = () => submit(sanitiseTaxId({ value, name }))
```

## Test every permutation

Once the logic is out, test it exhaustively. Every branch needs a case:

- Valid input — the happy path for **each** branch, not just the first
- Invalid and malformed input
- Empty, null, missing fields
- Edge cases: boundary values, special characters, values containing the delimiter
  you split on

```ts
// ❌ happy path only
test('parses a filter', () => {
  expect(parseFilter('id:gte:20')).toStrictEqual({ column: 'id', op: 'gte', value: '20' })
})

// ✅ every permutation
test('parses a valid filter', …)
test('handles a timestamp value containing colons', …)
test('rejects a malformed filter with missing parts', …)
test('rejects an unrecognised operator', …)
test('allows an empty value', …)
```

The colon-in-the-timestamp case is the archetype: it is the one that ships broken,
because the happy-path test passed.

## Component tests — for interaction only

Write one only when there is genuine UI interaction logic that a utility test cannot
capture.

**Valid:** conditional rendering that depends on an interaction *sequence*; popover
open/close via keyboard and mouse; multi-step form transitions; focus management.

**Not valid:** a calculation or transformation that happens to live in a component.
Extract it and unit test it.

Use the project's shared render helper rather than a raw `render`, so providers,
router context, and the query client are wired the same way in every test. Mock the
API at the network layer (MSW or equivalent) rather than by stubbing hooks —
stubbing the hook means the query key, the `enabled` gate, and the error path are all
untested.

## E2E — for critical and cross-surface flows

Write an E2E test when the flow spans surfaces (`{{surfaces}}`), when it is a path
whose breakage would be a production incident, or when correctness depends on the real
browser (focus, scroll, clipboard, file upload).

Cover mouse **and** keyboard. A flow that only works with a mouse is a flow that is
broken for a portion of your users, and the E2E test is where that gets caught.

Extract reusable interactions into helper modules. See `e2e-tests`.

## What not to test

- Generated code
- Third-party library behaviour
- Implementation details — a test asserting on internal state breaks on every refactor
  and catches no bugs
- Snapshot tests of entire components. They fail on every change and are updated
  without being read, which makes them worse than no test.

## Coverage

Coverage is a signal, not a target. An untested branch in a permission check matters
enormously; an untested branch in a formatting helper's fallback does not. When
reviewing coverage, look for **untested error paths and untested denials** first —
that is where the real gaps are.

## Related

- `e2e-tests` — running and writing browser tests
- `web-best-practices` — where logic should live in the first place
- `verify` — tests are step 1 of the evidence bundle, not the whole of it
