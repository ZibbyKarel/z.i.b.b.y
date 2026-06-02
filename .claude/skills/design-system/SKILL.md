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

The `Theme` interface in `tokens.ts` is the **single source of visual truth** — a flat object
with descriptive property names (`colorForeground`, `colorBorderStrong`, `radiusSm`, …).

`DesignSystemProvider` injects all `Theme` values as CSS custom properties via `tokensToCssVars()`.
Tailwind `@theme` in `globals.css` maps Tailwind utility classes to those same CSS vars.

**TS theme property → CSS var → Tailwind class:**
- `colorForeground`      → `--color-foreground`      → `text-foreground`
- `colorForegroundDim`   → `--color-foreground-dim`   → `text-foreground-dim`
- `colorForegroundFaint` → `--color-foreground-faint` → `text-foreground-faint`
- `colorBackground`      → `--color-background`       → `bg-background`
- `colorSurface`         → `--color-surface`          → `bg-surface`
- `colorElevated`        → `--color-elevated`         → `bg-elevated`
- `colorRaised`          → `--color-raised`           → `bg-raised`
- `colorBorder`          → `--color-border`           → `border-border`
- `colorBorderStrong`    → `--color-border-strong`    → `border-border-strong`
- `colorAccent`          → `--color-accent`           → `text-accent` / `bg-accent`
- `colorAccentDim`       → `--color-accent-dim`       → `bg-accent-dim`
- `colorAccentContrast`  → `--color-accent-contrast`  → `text-accent-contrast`
- `colorHome` / `colorWork` → `--color-home/work`     → `text-home` / `text-work`
- `colorOk/Warn/Danger`  → `--color-ok/warn/bad`      → `text-ok` / `bg-ok` / `bg-ok/12` …
- `shadowGlowAccent`     → `--shadow-glow-accent`     → `shadow-glow-accent`
- `radiusDefault`        → `--radius`                 → `rounded`
- `radiusSm`             → `--radius-sm`              → `rounded-sm`

```ts
type Spacing =
  | "0"   // 0px
  | "25"  // 2px
  | "50"  // 4px
  | "75"  // 6px
  | "100" // 8px
  | "150" // 12px
  | "200" // 16px
  | "250" // 20px
  | "300" // 24px
  | "350" // 28px
  | "400" // 32px
  | "450" // 36px
  | "500"; // 40px

type Padding = Spacing | [Spacing, Spacing] | [Spacing, Spacing, Spacing, Spacing];

type Size = "xs" | "sm" | "md" | "lg" | "xl";  // semantic T-shirt sizes

type IconStroke = "thin" | "default" | "medium" | "bold"; // 1.2 / 1.6 / 2 / 2.4
type DialogWidth = "sm" | "md" | "lg" | "xl" | "2xl";    // 360 / 460 / 600 / 800 / 1000px
```

### Sealed component sizing — no raw px in public props

All DS component props that control visual size use semantic tokens, never raw numbers or px strings.

| Prop | Type | Component |
|------|------|-----------|
| `size` | `Size` | `Icon` — xs=12, sm=14, md=16, lg=20, xl=24 |
| `stroke` | `IconStroke` | `Icon` — thin/default/medium/bold |
| `size` | `Spacing` | `StatusDot` — diameter token, default "100" (8px) |
| `height` | `Spacing` | `Progress` — track height token, default "75" (6px) |
| `inset` | `Spacing` | `Corners` — corner bracket offset, default "75" (6px) |
| `padding` | `Padding` | `CardContent` — content padding, default "200" (16px) |
| `padding` | `Padding` | `Container` — accepts Spacing token(s) only |
| `width` | `DialogWidth` | `Dialog` — sm/md/lg/xl/2xl preset widths |

**No `paddingX` / `paddingY` props on `Container`** — use `padding={["0", "200"]}` (CSS [y, x] shorthand) or `padding={["t", "r", "b", "l"]}` (4-value shorthand).

`Icon` omits `width`, `height`, and `strokeWidth` from SVG spread to prevent raw px overrides.

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
useTokens()   → Theme   // raw JS access — only for SVG attrs, canvas drawing
useSpacing()  → string  // px value for a Spacing token
```

**Do NOT use `useTokens()` in components for styling.** Use Tailwind classes instead.
The `Theme` object is available in context for the rare case where a raw JS value is needed
(e.g. SVG `fill=` attribute, canvas drawing).

Never hardcode token values — always use Tailwind classes or `var(--)`.

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
`className` is **Omitted from every DS component's public Props type.** Use typed variants/props instead.

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

export type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> &
  VariantProps<typeof button>

// React 19 — ref as a regular prop, NO forwardRef
export function Button({ intent, size, ref, ...props }: ButtonProps & {
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

`Corners` has a `tone` prop: `"accent" | "bad" | "ok" | "warn"` (default `"accent"`).
`Chip` has a `size` prop: `"sm"` (default, compact) or `"md"` (larger, for labels/context tags).

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

**Mandatory for every component.** Each component declares its own `<Component>TestId` enum
naming each important part it renders, and wires `data-testid` onto those parts. Tests then
select elements with `getByTestId` — never `querySelector`, `container.firstChild`, or role/text
queries used purely to *grab* a node (see Tests below).

```ts
// Each component has its own enum — no loose strings. Values are kebab "<component>-<part>".
export enum ButtonTestId {
  Root = "button-root",
  Icon = "button-icon",
}
```

Rules:

- **One member per meaningful part**, not per DOM node. A single-element component gets just `Root`.
- **Polymorphic / spread components** (e.g. `Stack`, `Container`, `Card`): put `data-testid` **before**
  `{...rest}`/`{...props}` so a consumer can still override it.
- **Repeated/keyed parts** (lists, tabs, options): when a stable key exists, suffix the enum value
  with it and key tests off the same prefix — keeps the prefix in the enum, no loose strings:

  ```ts
  export enum TabsTestId { Root = "tabs-root", Tab = "tabs-tab", Panel = "tabs-panel" }
  // component: <button data-testid={`${TabsTestId.Tab}-${value}`} … />
  // test:      screen.getByTestId(`${TabsTestId.Tab}-${value}`)
  ```

  When there's no external key (e.g. `Accordion` items keyed by internal `useId`), use a static
  member and select with `getAllByTestId(...)` + index.

Multi-part example:

```ts
export enum DialogTestId {
  Overlay = "dialog-overlay",
  Root = "dialog-root",
  Header = "dialog-header",
  Title = "dialog-title",
  CloseButton = "dialog-close-button",
  Body = "dialog-body",
  Footer = "dialog-footer",
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

- `List` is a compound container; each row is `<ListItem>` with optional `<ListItemIcon>`, `<ListItemText>`, `<ListItemBadge>` sub-components.
- `ListItem` accepts `active?`, `onSelect?`, `href?`, `linkComponent?` — renders as button, link, or div depending on props.
- `NavItem` (lives in `List.tsx`, re-exported from index) is the chrome data type for nav config arrays — not a domain entity.
- `ContextName` (`"home"|"work"`) is a DS theme concept — chrome takes it from `DesignSystemContext/contextTokens`, not from `domain.ts`.
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
Button.stories.tsx ← exactly two exports: Overview + Playground
```

**Every DS component must have a test.** Exception: no per-icon tests.

### `getByTestId` is the primary selector

Grab elements through the component's `<Component>TestId` enum (see Testid enum above) with
`getByTestId` / `queryByTestId` / `getAllByTestId`. Do **not** use `container.querySelector`,
`container.firstChild`, or `getByRole`/`getByText` *as a way to find a node*.

**Roles and ARIA stay — but as assertions, not selectors.** The selector changes; the assertion
set never shrinks. Whatever a test verified before (a role, an accessible name, an `aria-*`), it
must still verify after. Use jest-dom matchers on the node you got by test-id:

```ts
const el = screen.getByTestId(ProgressTestId.Root);
expect(el).toHaveRole("progressbar");            // was getByRole("progressbar")
expect(el).toHaveAccessibleName("5h rolling");   // was the { name } option
expect(el).toHaveAttribute("aria-valuenow", "64");
```

`toHaveRole`, `toHaveAccessibleName`, `toHaveAccessibleDescription`, and `toHaveAttribute` are all
available (jest-dom ≥ 6). For label↔control association, assert `toHaveAccessibleName(label)` on the
control selected by test-id — it only passes when the `htmlFor`/`id` wiring is intact.

**Consumer-passed content** (children, slots like `actions`) carries no test-id of ours. Scope into
the owning part and query within it:

```ts
within(screen.getByTestId(DialogTestId.Footer)).getByRole("button", { name: "OK" })
```

Domain composites moved to app: use `apps/web/test/renderWithIntl.tsx` as test wrapper.
**Stories only for DS** — moved domain composites have no stories.

---

## Storybook

Storybook is for `libs/design-system` only. Every story file has **exactly two named exports** in this order:

1. **`Overview`** — static `render:` function showing all variants/states stacked vertically. No args wiring.
2. **`Playground`** — args-based story with full controls. Use `argTypes` in meta for selects/radios. For stateful components (ButtonGroup, List) use a `render:` with `useState`.

```tsx
// Button.stories.tsx
export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <Button intent="run" icon="play">Spustit</Button>
        <Button intent="solid">Solid</Button>
        {/* …all variants… */}
      </div>
    </div>
  ),
};

export const Playground: Story = {};  // picks up meta args + argTypes
```

No other story exports. Remove `Default`, `Tones`, `Sizes`, `WithHeader`, etc. — everything goes into `Overview`.

Toolbar: `theme` (dark/light) and `context` (home/work) switchers via `DesignSystemProvider` decorator.

**Every DS component must have a story file** with exactly the `Overview` + `Playground` pair.

**Icon exception:** `Icon.stories.tsx` also has exactly two stories — `Overview` renders the full `iconNames` glyph grid, `Playground` renders a single configurable icon with controls. No per-icon stories.

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
- Add a third story to a story file — exactly `Overview` + `Playground`, nothing else
- Add query hooks to `libs/` without a clear sharing reason
- Create UI primitives in the app when they can be added to DS (decide explicitly first)
- **Accept `className` in DS component Props** — DS is sealed; all styling is via typed variants/props. Every Props type must `Omit<..., "className">` (or exclude it from a custom interface). App code may never pass `className` to a DS component.
- **Expose raw px values in component props** — use `Size`, `Spacing`, `Padding`, `IconStroke`, `DialogWidth` instead of `number` or `string`. This keeps sizing at the semantic/token level; users pick from preselected options.
- **Add `paddingX` / `paddingY` props** — use `padding={[y, x]}` (2-tuple) or `padding={[t, r, b, l]}` (4-tuple) instead.
