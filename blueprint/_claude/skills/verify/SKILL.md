---
name: verify
description: Collect the Rule 28 evidence bundle before claiming any change is done — bundle scan, live render, behavioural assertion, and an OpenAPI probe. Use before closing an issue, before push, before promote, and any time you are about to say "done", "fixed", "should work", or "that's deployed".
---

# verify — Evidence, not adjectives

Rule 28: **a change is not done until it is verified live, with the command output
pasted.** "It compiles" is not evidence. "Should work now" is not evidence. A green
build is not evidence that the thing renders.

Four artefacts, in order. All four, or say which one you skipped and why.

---

## 1. Bundle scan — does it build, lint, and type-check?

```bash
togo lint                 # go vet, staticcheck, golangci-lint, eslint
go build ./...
togo test                 # go test ./...  (set TEST_DATABASE_URL for DB-backed tests)
```

Frontend:

```bash
cd web && npm run typecheck     # tsc --noEmit — NOT npm run build
cd web && npm run build         # only when you need the real bundle (see below)
```

Then scan the build/dev log for the failure classes a zero exit code hides:

```bash
grep -nE "Module not found|Failed to compile|Type error|Cannot find name|is not exported" /tmp/{{project_name}}-web.log
```

A dev server prints `Module not found` and keeps serving a stale page. Exit code 0
from the *process* means nothing; the log is the evidence.

**Generated code gate.** If the change touched `internal/db/queries/*.sql`, a GraphQL
schema, or a controller, `togo generate` must have run and its `*.gen.go` output must
be committed:

```bash
togo generate
git status --porcelain -- '*.gen.go'    # must be empty
```

A dirty `*.gen.go` after generate means the committed generated code does not match
the source. See `togo-generate`.

---

## 2. Live render — is the process actually serving?

Start it and prove it answers:

```bash
togo dev &                # or: togo serve
curl -s -o /dev/null -w '%{http_code}\n' {{api_base}}/healthz
```

For a page change, load the actual route and confirm the changed element is in the
response — not just that the route 200s:

```bash
curl -s http://localhost:3000/<route> | grep -c 'data-testid="<the-thing-you-added>"'
```

A `200` from a page that renders an error boundary is a 200. Grep for the element.

An auth-gated route returning `307 → /login` unauthenticated **is** a correct live
render — say so rather than treating it as a failure.

---

## 3. Behavioural assertion — does it do the thing?

This is the one people skip. Exercise the actual behaviour that changed, with the
actual inputs, and assert on the actual output.

```bash
# create
curl -s -X POST {{api_base}}/v1/<resource> \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"verify-probe"}' | tee /tmp/created.json

# read it back — the assertion, not the echo
curl -s {{api_base}}/v1/<resource>/$(jq -r .id /tmp/created.json) \
  -H "Authorization: Bearer $TOKEN" | jq -e '.name == "verify-probe"'
```

Rules for a real assertion:

- Assert on a value, not a status code alone (`jq -e` exits non-zero on false — use it)
- Include the **negative** case: the thing that should be rejected must be rejected.
  Permission checks especially — togo's `Can()` is an exact string match, so a
  permission set that "looks" permissive may deny everything. Probe a denied call and
  confirm it is denied for the right reason.
- Clean up what you created, or create it in a scratch tenant

For a UI change, the behavioural assertion is a Playwright interaction, not a
screenshot. See `e2e-tests`.

---

## 4. OpenAPI probe — is the contract what you think it is?

```bash
curl -s {{api_base}}/openapi.json | jq '.paths | keys' | head -40
curl -s {{api_base}}/openapi.json | jq '.paths["/v1/<resource>"] | keys'
```

`togo generate`'s last step exports OpenAPI by compiling the whole program, so this
document is the single place where a route that exists in the router but not in the
spec (or vice versa) becomes visible. If you added an endpoint and it is absent here,
the handler is not registered — the tests you wrote are testing something else.

Diff it against the previous state when the change was contract-affecting:

```bash
curl -s {{api_base}}/openapi.json | jq -S . > /tmp/openapi.new.json
git show HEAD:docs/openapi.json | jq -S . > /tmp/openapi.old.json
diff -u /tmp/openapi.old.json /tmp/openapi.new.json | head -60
```

---

## The evidence bundle

Report it in this shape. Paste real output, trimmed — never paraphrased.

```
Verification — <change description>

1. Bundle scan
   togo lint          → ok
   go build ./...     → ok
   togo test          → ok (42 tests, 0 failures)
   web typecheck      → ok
   *.gen.go dirty     → none

2. Live render
   GET {{api_base}}/healthz              → 200
   GET http://localhost:3000/orders      → 200, data-testid="orders-table" present

3. Behavioural assertion
   POST /v1/orders {"name":"verify-probe"}   → 201, id=0f3c…
   GET  /v1/orders/0f3c…                     → 200, .name == "verify-probe" ✓
   GET  /v1/orders/0f3c… (no token)          → 401 ✓

4. OpenAPI
   /v1/orders present with get, post ✓

Not verified: <anything you could not check, and why>
```

## Rules of reporting

- **If you skipped a step, name it.** "Behavioural assertion skipped — no seeded
  tenant available locally" is a fine answer. Silence is not.
- **If something failed, show the output.** Do not summarise a failure into a
  reassuring sentence.
- **Do not say "should work".** Either you ran it or you did not.
- **Do not accept your own test as the assertion** when the test mocks the thing
  under change. A passing test against a mocked handler proves the mock works.
- **Green CI is step 1 only.** It does not stand in for steps 2–4.

## Related

- `promote` — Step 4 there is this skill applied to `{{prod_ref}}`
- `e2e-tests` — the browser-side behavioural assertion
- `togo-generate` — why `*.gen.go` cleanliness is part of the gate
