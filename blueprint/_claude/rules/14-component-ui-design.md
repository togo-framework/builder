---
description: "All UI must use shadcn/ui components with Tailwind. No CSS files, no inline styles, no hardcoded colors."
globs: "web/**/*.tsx,web/**/*.jsx"
alwaysApply: false
---

# Rule 14: Component-Based UI Design

**Every pixel in `web/` comes from a shadcn/ui primitive styled with Tailwind classes — no CSS files, no inline styles, no hardcoded colors.**

## The Rule

Applies to all component code under `web/src/` ({{surfaces}}).

- Use **shadcn/ui** components from `@/components/ui/`
- All styling via **Tailwind CSS** classes — no CSS files, no inline styles
- Use Radix UI primitives for accessible interactive components
- `const` arrow functions with `displayName` set on every component
- `handle` prefix for event handlers: `handleClick`, `handleSubmit`
- Before creating a new component, check if `@/components/ui/` has something reusable

```tsx
const PostCard = ({ post }: { post: Post }) => {
  const handleClick = () => { /* ... */ }
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-lg font-semibold">{post.title}</h3>
    </div>
  )
}
PostCard.displayName = 'PostCard'
```

### Also

- Extract repeated UI patterns into components immediately
- Component naming must be consistent with sibling components
- No `className` string concatenation — use the `cn()` utility from shadcn
- Semantic Tailwind tokens only: `bg-card`, `text-muted-foreground`, `border-border` — never a
  hex value, an `rgb()`, or an arbitrary color like `text-[#1f2937]`. Hardcoded colors survive
  neither a theme change nor dark mode.
- Data comes in as props or from a TanStack Query hook. A presentational component does not
  fetch, and it certainly does not reach past the API (Rule 12).
- Types for API shapes come from the generated OpenAPI contract, not hand-written interfaces
  that drift (Rule 10).

## Why this rule exists — concrete cost

Every escape hatch this rule closes has the same cost profile: it works today and is unfixable
later.

A hardcoded color is invisible until the day the project adds dark mode or a second theme, at
which point it is not one edit but a grep across every component, and the ones you miss are
found by users as white text on a white background. Semantic tokens make that change a
one-file change.

An inline style or a stray CSS file wins its specificity fight locally and then loses the
global one: it cannot be overridden by a utility class, so the next person "fixes" it with
`!important`, and the file becomes untouchable. A component that is not built on the Radix
primitive re-implements focus trapping, keyboard navigation, and ARIA wiring by hand — badly,
because those are hard — and the accessibility regression is discovered in an audit rather than
in review.

`className` concatenation produces silently conflicting Tailwind classes (`p-2` and `p-4` both
present, winner decided by stylesheet order); `cn()` merges them deterministically. And a
missing `displayName` costs nothing until you are staring at a React DevTools tree of anonymous
components trying to find which one re-rendered.

None of these are hypothetical framework opinions — each is the ordinary outcome of the
shortcut, which is why they are stated as rules rather than preferences.

## Enforcement

- Review blocks on: any `.css` file added under `web/src/` (outside the Tailwind entry point
  and design tokens), any `style={{ ... }}` prop, any hex/`rgb()`/arbitrary-color class.
- Review blocks on a component without `displayName`, or an event handler not prefixed
  `handle`.
- Before adding a component, list what already exists in `@/components/ui/`. "I didn't check"
  is not an answer; a duplicated primitive is a permanent maintenance tax.
- `npm run lint` and the project typecheck must pass before done.
