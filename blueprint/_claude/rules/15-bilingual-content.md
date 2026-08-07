---
description: "Every user-facing string exists in all declared locales. Localized columns carry a locale suffix, the API returns all variants, and the UI selects one — including RTL when a declared locale is RTL."
globs: "web/**/*.tsx,web/**/*.ts,internal/db/schema/*.sql,internal/db/queries/*.sql,**/*.go,togo.resources.yaml"
alwaysApply: false
conditional: locales.length > 1
---

# Rule 15: Multilingual Content

**{{project_name}} serves {{locales}}. Every user-facing feature must exist in all of them, or it is not done.**

> **Wizard note.** This rule is conditional on `locales.length > 1`. When `{{locales}}` holds a
> single locale, the wizard emits only the one-line form below and drops everything after it —
> a monolingual project should not carry a localization rulebook it will never read.
>
> **Monolingual form (single-locale projects ship exactly this):**
> `{{project_name}} is monolingual ({{locales}}). User-facing strings are written directly in that locale; no locale suffixes, no locale switch, no RTL handling. If a second locale is ever added, restore this rule in full before writing the first translated string.`

---

## The Rule

Declared locales: **{{locales}}**. The first entry is the primary locale — it is `NOT NULL`
everywhere and is the fallback when a translation is missing. Every other declared locale is
nullable, expected, and rendered when the user selects it.

### 1. Declaration — `togo.resources.yaml`

Localized fields are declared once, per locale, with a locale suffix. Because the resource file
is the source of truth for the generators (Rule 10), this is the *only* place the suffix
convention is spelled by hand:

```yaml
resources:
    - name: Post
      table: posts
      fields:
        - name: title_en          # primary locale — required
          go: string
          gql: String!
          pg: text
          "null": false
        - name: title_ar          # additional declared locale — nullable
          go: string
          gql: String
          pg: text
          "null": true
```

Then `togo make:resource` / `togo generate` / `togo migrate`. Never add a localized column by
hand-editing the schema and never by DDL from service code (Rules 10, 11).

### 2. Schema — the generated shape

```sql
-- internal/db/schema/post.sql (generated from the declaration)
title_en        text NOT NULL,
title_ar        text,
description_en  text NOT NULL,
description_ar  text
```

The primary locale is `NOT NULL` so there is always something to render. Additional locales are
nullable so a missing translation is a degraded experience, not a failed request.

### 3. Go — return every variant, decide nothing

The API returns all locale variants and lets the client choose. Selection is a presentation
concern; an API that picks for the caller cannot serve a client that switches language without
a round trip.

Models come from the generator and the ORM. Do not hand-write structs with database tags — that
is the ancestor framework's pattern and it is banned here (Rule 13):

```go
// CORRECT — generated model, read through the togo ORM
posts, err := models.Posts(app).
    Where("published", "=", true).
    Order("created_at DESC").
    Get(ctx)
if err != nil {
    return fmt.Errorf("list published posts: %w", err)
}
// posts[i].TitleEn, posts[i].TitleAr — both fields present, both returned
```

```go
// WRONG — hand-written struct with db tags, hand-written SQL.
// Inverted by Rule 13: togo generates this from togo.resources.yaml.
type Post struct {
    TitleEN string `json:"title_en" db:"title_en"`
    TitleAR string `json:"title_ar" db:"title_ar"`
}
rows, _ := pool.Query(ctx, `SELECT title_en, title_ar FROM posts`)
```

Server-rendered or server-emitted strings (validation messages, emails, notifications) resolve
through the i18n provider against the request's locale — never a hardcoded English literal in a
handler.

### 4. Frontend — select, with fallback

```tsx
const { locale } = useLocale()
const title = post[`title_${locale}`] || post.title_en   // primary locale is the fallback
```

The fallback is mandatory. A nullable translated column will be null in production the first
week; rendering `null` or `"undefined"` to a user is the failure this rule exists to prevent.

Static UI copy — labels, buttons, empty states, error text — lives in the locale message files
(`lang/<locale>.json`), never as a literal in a component. A hardcoded string is untranslatable
by construction.

### 5. Direction — RTL

If any declared locale in {{locales}} is right-to-left (ar, he, fa, ur):

- Set `dir` on the document root from the active locale — not per-component.
- Use CSS logical properties everywhere: `margin-inline-start`, not `margin-left`;
  `ps-4`/`pe-4`, not `pl-4`/`pr-4`. Physical properties are the single most common cause of a
  layout that is correct in LTR and broken in RTL.
- Reach for the `rtl:` Tailwind variant only for genuine directional assets — chevrons, arrows,
  progress indicators — not to patch a layout that should have used logical properties.
- Numbers, code, and identifiers stay LTR inside RTL text; wrap them so bidi does not reorder
  them.
- **Test every new page in every declared locale before calling it done.** Not a screenshot of
  the primary locale.

## Anti-Patterns

| Wrong | Right |
|---|---|
| Ship the primary locale, "translate later" | Both columns declared, both rendered, in the same change |
| `title` — one column, translated in place | `title_en` + `title_ar` — declared per locale |
| Handler picks the string by `Accept-Language` | API returns all variants; the client selects |
| `post.title_ar` with no fallback | `post.title_ar \|\| post.title_en` |
| `pl-4` / `margin-left` in a project with an RTL locale | `ps-4` / `margin-inline-start` |
| Literal `"Save"` in a component | A key in `lang/<locale>.json` |
| Add the column with `ALTER TABLE` from code | Declare in `togo.resources.yaml`, `togo migrate` |

## Why this rule exists — concrete cost

Localization is the one requirement that becomes exponentially more expensive with delay, and
the cost is structural rather than anecdotal.

A column shipped as `title` instead of `title_en` cannot be fixed by adding `title_ar` later —
it needs a migration, a backfill, a change to every query file, a regeneration, and a
coordinated frontend change, all at once, on a table that now has production rows. Declaring
both columns on day one costs one extra YAML block.

The missing-fallback failure is not rare, it is guaranteed: the additional-locale columns are
nullable by design, so the first record created before a translator gets to it renders as
`null` in the UI. Without the `|| primary` fallback, that is a blank card or the literal string
"undefined" in front of a user.

The RTL cost is the harshest, because physical CSS properties fail *silently* in the direction
nobody on the team reads. `margin-left` is not an error in RTL — it is a layout that looks
deliberate and is backwards, discovered by the users who need that locale most. Logical
properties are the same number of characters and never wrong.

## Enforcement

- **A localized field is not done in one locale.** A change adding `*_{{primary}}` without the
  siblings declared in `togo.resources.yaml` is a review blocker.
- Grep new `.tsx` for string literals inside JSX. Every one must be a message key.
- Grep new styles for physical properties (`margin-left`, `padding-right`, `left-`, `right-`,
  `pl-`, `pr-`, `ml-`, `mr-`, `text-left`, `text-right`) when an RTL locale is declared.
- Grep new `.tsx` for `_${locale}` lookups without a `||` fallback.
- Verify in the browser in every declared locale, RTL included, before reporting done. State
  which locales you checked.
