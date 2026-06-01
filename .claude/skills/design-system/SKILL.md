---
name: design-system
description: >
  Design and build components for the z.i.b.b.y design system. Use this skill
  whenever working with anything in libs/design-system — new components, variant
  changes, token updates, a11y fixes.
---

# Design System Skill

This skill is the source of truth for all design system conventions in `libs/design-system`.
Always read `CLAUDE.md` in the repo root for project-wide context (routing, i18n, TypeScript, etc.).

---

## File structure

```
libs/design-system/src/
  tokens.ts               ← token type definitions
  themes/
    dark.ts
    light.ts              ← stub (TODO: design light palette)
  visualStyles.ts         ← pure style helper functions (no hooks)
  components/
    Button/
      Button.tsx
      Button.test.tsx
      Button.stories.tsx
    assets/icons/         ← icon SVGs / icon set
  index.ts                ← public exports
```

Each component lives in its own folder. Test and story files sit next to the component.

---

## Design tokens

Tokens are **TypeScript objects** (`tokens.ts`, `themes/`). `DesignSystemProvider` injects them
as inline CSS custom properties via `tokensToCssVars()`. Tailwind `@theme` in `globals.css`
maps Tailwind utility classes to those same CSS vars.

```ts
type Spacing =
  | "0"
  | "25"
  | "50"
  | "75"
  | "100"
  | "150"
  | "200"
  | "250"
  | "300"
  | "350"
  | "400"
  | "450"
  | "500";
type ColorTokens = { text; bg; border; accent; surface };
type DesignTokens = { color: ColorTokens; size: SizeTokens; font: FontTokens };
```

### Themes and context

- `darkTheme` / `lightTheme` in `src/themes/` — HUD values (amber/blue accents, small radii)
- `contextTokens(context)` returns a `PartialDesignTokens` accent override (home=amber, work=sky)

### Provider

```tsx
<DesignSystemProvider theme="dark" tokens={contextTokens(ctx)}>
  {children}
</DesignSystemProvider>
```

- Sets `data-theme` → powers `dark:` Tailwind variant
- Injects CSS vars: `--text-primary`, `--bg-surface`, `--accent`, `--radius`, …
- **`h-full` is load-bearing** — the provider div has `height:100%`
- Does NOT import `globals.css` — the app and Storybook link it

### Hooks

```ts
useTokens()       → DesignTokens
useTextColors()   → ColorTokens["text"]
useAccentColors() → ColorTokens["accent"]
useSizeTokens()   → SizeTokens
useFontTokens()   → FontTokens
```

### Surface layer (inline styling in components)

```ts
// src/visualStyles.ts — pure functions, no hooks
bgValue(bg, tokens)             → string
borderColorValue(tone, tokens)  → string
radiusValue(radius, tokens)     → string
computeVisualStyle(props, tokens) → CSSProperties
```

Never hardcode token values — always use `useTokens()` or `var(--)`.

---

## Tailwind v4

- CSS-first config: `@import "tailwindcss"` + `@theme {}` in `globals.css`
- No `tailwind.config.ts` — deleted
- PostCSS: `@tailwindcss/postcss` (web); Storybook: `@tailwindcss/vite` in `viteFinal`
- Dark mode: `@custom-variant dark (&:where([data-theme="dark"], .dark, ...))`
- Custom spacing overrides for 5/6/7: `--spacing-5:18px; --spacing-6:22px; --spacing-7:26px`
- **Cross-package content:** `apps/web/app/globals.css` adds `@source "../../libs/design-system/src"` — v4 auto-detect does not cross workspace boundaries
- Never write Tailwind classes outside `libs/design-system` (exception: layout utilities in `app/`)
- Never use Tailwind default classes (`gray-100`, `blue-500`) — use semantic tokens

---

## CVA variants

Every component with visual states uses `class-variance-authority`.

```ts
import { cva, type VariantProps } from "class-variance-authority";

const component = cva("base-classes", {
  variants: {
    intent: { primary: "...", danger: "...", ghost: "..." },
    size: { sm: "...", md: "...", lg: "..." },
  },
  defaultVariants: { intent: "primary", size: "md" },
  compoundVariants: [],
});

type ComponentProps = React.ComponentPropsWithoutRef<"button"> &
  VariantProps<typeof component>;
```

Tailwind classes belong **only here** — the DS is sealed; no `className` overrides from outside.

### Variant maps (for non-CVA cases)

```ts
// module-level Record, not inline
const toneMap: Record<Tone, string> = { ok: "text-ok", ... }
```

---

## Component implementation pattern

```tsx
// Button.tsx
import { cva, type VariantProps } from "class-variance-authority"

const button = cva("...", { variants: { intent: {...}, size: {...} } })

export type ButtonProps = React.ComponentPropsWithoutRef<"button"> &
  VariantProps<typeof button>

// React 19 — ref as a regular prop, NO forwardRef
export function Button({ intent, size, ref, className, ...props }: ButtonProps & {
  ref?: React.Ref<HTMLButtonElement>
}) {
  return <button ref={ref} className={button({ intent, size })} {...props} />
}
```

---

## Component layers

### Primitive layer (zero visual opinion)

- **Container** — padding (Spacing tokens), dimensions, positioning, overflow, flex-child; `as?` (narrow tag union)
- **Stack** — `display:flex`, `direction`, `gap`, `align`, `justify`; `Row` = horizontal Stack
- **Spacer** — inserts a fixed or flex gap

### Generic components

Compose primitives + `computeVisualStyle()`. Style inline from tokens or Tailwind utilities reading `var(--)`. Must not import domain types.

**Complex DS components may and should use other DS components as building blocks.**
Import directly from the same package (not through `index.ts` to avoid circular paths):

```tsx
// ✅ EmptyState built from DS primitives
import { Stack } from "../Stack/Stack"
import { Text } from "../Text/Text"
import { Icon } from "../Icon/Icon"

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <Stack direction="col" align="center" gap="200">
      <Icon name={icon} />
      <Text weight="medium">{title}</Text>
      {description && <Text tone="secondary">{description}</Text>}
    </Stack>
  )
}

// ✅ Stat built using Card + Text
import { Card, CardContent } from "../Card/Card"
import { Text } from "../Text/Text"
```

Good candidates to reach for: `Stack`, `Row`, `Container`, `Text`, `Heading`, `Icon`, `Card`, `Badge`, `Divider`, `Spacer`.

Full list: `Text`, `Heading`, `Divider`, `Badge`, `Chip`, `Kbd`, `Alert`, `Card`
(`CardHeader`/`CardContent`/`CardFooter`/`CardActions`), `Dialog` (`DialogBody`),
`Tabs` (`TabList`/`Tab`/`TabPanel`), `Accordion` (`AccordionSummary`/`AccordionDetails`),
`Button`, `Icon`, `Progress`, `StatusDot`, `Stat`, `Sparkline`, `EmptyState`, `SectionLabel`,
`HudPanel`, `Corners`, `EntityFormModal`, `Field` family,
`ButtonGroup`, `List`, `TopBar`

---

## Compound pattern — allowed

Layout-flexible components (Card, Dialog, Tabs, Accordion) use compound API:

```tsx
// ✅ compound — OK for layout-flexible components
<Card>
  <CardHeader>Title</CardHeader>
  <CardContent>…</CardContent>
  <CardActions><Button>OK</Button></CardActions>
</Card>

// ✅ flat props — still preferred for simple components
<Dialog open title="Delete?" onClose={close} actions={<Button>OK</Button>} />
```

---

## React 19 — no forwardRef

```tsx
// ✅ React 19 ref-as-prop
function Button({ ref, ...props }: ButtonProps & { ref?: React.Ref<HTMLButtonElement> }) { ... }

// ❌ deprecated and forbidden
const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => { ... })
```

---

## Testid enum

```ts
// Each component has its own enum — no loose strings
export enum ButtonTestId {
  Root = "button-root",
  Icon = "button-icon",
}
```

---

## asChild / polymorphism

No `asChild`. Polymorphism via `as?: NarrowUnion` prop.

---

## Icons

Keep icons under `libs/design-system/src/components/assets/icons`. The `Icon` component renders
a glyph via the `name` prop (union `IconName`, glyph set in `iconNames`).

- **No per-icon tests** and **no per-icon stories.**
- Instead, one **shared story** that renders the full icon set.

---

## Dashboard chrome (DS, router-agnostic + domain-neutral)

`ButtonGroup`, `List`, `TopBar` live in DS and **must not import domain types**.
They must not import `next/link`/`usePathname` — Storybook has no Next router.

- `List` accepts a `linkComponent?` prop (default = `<button>`); the app passes `<Link>`.
- `ContextName` (`"home"|"work"`) is a DS theme concept — chrome takes it from `DesignSystemContext/contextTokens`, not from `domain.ts`.
- `ListItem` is a chrome type (lives in `List.tsx`, re-exported from index) — not a domain entity.
- Domain wallet/limits are injected via slot: `TopBar` has `walletSlot?: ReactNode`; the app passes its `LimitsWidget` (`apps/web/features/dashboard/components/LimitsWidget.tsx`).
- `MainLayout` (app's full chrome: grid overlay, nav, TopBar, content) lives in `apps/web/features/dashboard/components/MainLayout.tsx` — it is app-specific and not in DS.
- `BrandLogo` lives in `apps/web/features/dashboard/components/BrandLogo.tsx`.

---

## Domain composites (live in the app, not DS)

Components that import `AgentDef`/`Pipeline`/`Skill`/`Integration`/`Approval`/`ActivityEvent`/`ClaudeLimits`
live in `apps/web/features/<domain>/components/`.

Domain types (types only, no implementations) stay in DS `domain.ts`.

---

## Tests

Vitest + `@testing-library/react`. Co-located files:

```
Button.tsx
Button.test.tsx    ← basic render, ref-as-prop, className merge, states, userEvent
Button.stories.tsx ← Overview (all variants) + Playground (all controls)
```

**Every DS component must have a test.** Exception: no per-icon tests.

Domain composites moved to app: use `apps/web/test/renderWithIntl.tsx` as test wrapper.
**Stories only for DS** — moved domain composites have no stories.

---

## Storybook

Storybook is for `libs/design-system` only. Story convention:

```tsx
// 1. Overview — static render of all variants
// 2. Playground — all props as controls, event props { action: 'name' }
export default { tags: ["autodocs"] } satisfies Meta<typeof Component>;
```

Toolbar: `theme` (dark/light) and `context` (home/work) switchers via `DesignSystemProvider` decorator.

**Every DS component must have a story** (Overview + Playground). Exception: icons get one shared story showing the full set.

---

## A11y checklist

Before every component:

- [ ] Interactive elements are `<button>` or `<a>` (never `<div onClick>`)
- [ ] `aria-label` on icon buttons and inputs without visible labels
- [ ] `aria-disabled` instead of HTML `disabled` when the element must remain focusable
- [ ] Focus ring visible — `focus-visible:ring-2 focus-visible:ring-ring` classes
- [ ] Contrast: primary colors meet WCAG AA (4.5:1 text, 3:1 UI elements)
- [ ] Keyboard handling: `Enter`/`Space` for buttons, `Escape` for dialogs/popovers

A11y targets: WCAG AA (4.5:1 normal text, 3:1 large text + UI). Focus ring always visible — never `outline:none` without a replacement.

---

## Export

Every new component must be exported from `libs/design-system/src/index.ts`:

```ts
export { Button, type ButtonProps } from "./components/Button/Button";
```

Always export the Props type too — consumers in `apps/` need it for typing.

---

## Never do

- Write `forwardRef` (React 19 — ref-as-prop)
- Use `any` in TypeScript
- Write Tailwind classes outside `libs/design-system` (exception: layout utilities in `app/`)
- Hardcode token values in components (always `useTokens()` or `var(--)`)
- Import domain types into DS components
- Use `asChild` — use `as?: NarrowUnion` instead
- Add per-icon tests or per-icon stories
- Add query hooks to `libs/` without a clear sharing reason
- Create UI primitives in the app when they can be added to DS (decide explicitly first)
