# z.i.b.b.y — konvence projektu

Design systém + Next.js aplikace. Stack: Next.js 15 App Router, React 19, TanStack Query,
**Tailwind v4** (CSS-first `@theme`), TypeScript, NX monorepo.

---

## Struktura monorepa

```
libs/
  design-system/     ← tokeny, Provider, primitiva, generické komponenty, chrome
apps/
  web/               ← Next.js App Router; importuje z DS, nikdy netvoří vlastní Tailwind třídy
                        doménové kompozity žijí v apps/web/features/<doména>/components/
  api/               ← Node backend
```

---

## Design tokeny + DesignSystemProvider

Tokeny jsou **TypeScript objekty** (`libs/design-system/src/tokens.ts`, `src/themes/`).
`DesignSystemProvider` je injektuje jako inline CSS custom properties (`tokensToCssVars()`).
Tailwind `@theme` v `globals.css` mapuje Tailwind utility třídy na tytéž CSS vars.

### Token typy
```ts
// tokens.ts
type Spacing = '0'|'25'|'50'|'75'|'100'|'150'|'200'|'250'|'300'|'350'|'400'|'450'|'500'
type ColorTokens = { text, bg, border, accent, surface }
type DesignTokens = { color: ColorTokens; size: SizeTokens; font: FontTokens }
```

### Theme + context
- `darkTheme` / `lightTheme` v `src/themes/` — HUD hodnoty (amber/blue accenty, malé radii)
- `lightTheme` je stub (TODO: design light palette)
- `contextTokens(context)` vrátí `PartialDesignTokens` override pro accent (home=amber, work=sky)

### Provider
```tsx
<DesignSystemProvider theme="dark" tokens={contextTokens(ctx)}>
  {children}
</DesignSystemProvider>
```
- Nastaví `data-theme` → napájí `dark:` Tailwind variant
- Injektuje CSS vars: `--text-primary`, `--bg-surface`, `--accent`, `--radius`, …
- **`h-full` je load-bearing** — provider div má `height:100%`
- NEimportuje globals.css — linkuje appka a Storybook

### Hooks
```ts
useTokens() → DesignTokens
useTextColors() → ColorTokens["text"]
useAccentColors() → ColorTokens["accent"]
useSizeTokens() → SizeTokens
useFontTokens() → FontTokens
```

### Surface layer (pro inline styling v komponentách)
```ts
// src/visualStyles.ts — čisté funkce, žádné hooky
bgValue(bg, tokens) → string
borderColorValue(tone, tokens) → string
radiusValue(radius, tokens) → string
computeVisualStyle(props, tokens) → CSSProperties
```

---

## Tailwind v4

- CSS-first konfigurace: `@import "tailwindcss"` + `@theme {}` v `globals.css`
- Žádný `tailwind.config.ts` — smazán
- PostCSS: `@tailwindcss/postcss` (web); Storybook: `@tailwindcss/vite` v `viteFinal`
- Dark mode: `@custom-variant dark (&:where([data-theme="dark"], .dark, ...))`
- Custom spacing override pro 5/6/7: `--spacing-5:18px; --spacing-6:22px; --spacing-7:26px`
- **Cross-package content:** `apps/web/app/globals.css` přidává `@source "../../libs/design-system/src"` — v4 auto-detect nepřekračuje workspace hranici

---

## Komponenty

### Primitivní vrstva (zero visual opinion)
- **Container** — padding (Spacing tokeny), rozměry, pozicování, overflow, flex-child; `as?` (narrow union tagů)
- **Stack** — `display:flex`, `direction`, `gap`, `align`, `justify`; `Row` = horizontální Stack
- **Spacer** — vkládá pevnou nebo flex mezeru

### Generické komponenty
Skládají primitiva + `computeVisualStyle()`. Styl inline z tokenů nebo z Tailwind utility
čtoucích `var(--…)`. Nesmí importovat doménové typy.

Seznam: `Text`, `Heading`, `Divider`, `Badge`, `Chip`, `FilterChip`, `Kbd`, `Alert`, `Card`
(+ `CardHeader`/`CardContent`/`CardFooter`/`CardActions`), `Dialog` (+ `DialogBody`),
`Tabs` (+ `TabList`/`Tab`/`TabPanel`), `Accordion` (+ `AccordionSummary`/`AccordionDetails`),
`Button`, `Icon`, `Meter`, `StatusDot`, `Stat`, `Sparkline`, `EmptyState`, `SectionLabel`,
`HudPanel`, `Corners`, `EntityFormModal`, `Field` family, `RunModal`

### Variant mapy
```ts
// Record<Variant, string | CSSProperties> na úrovni modulu
const toneMap: Record<Tone, string> = { ok: "text-ok", ... }
```

### Compound pattern — POVOLEN
Layout-flexibilní komponenty (Card, Dialog, Tabs, Accordion) používají compound API:
```tsx
// ✅ compound — OK pro layout-flexibilní komponenty
<Card>
  <CardHeader>Nadpis</CardHeader>
  <CardContent>…</CardContent>
  <CardActions><Button>OK</Button></CardActions>
</Card>

// ✅ flat props — stále preferováno pro jednoduché komponenty
<Dialog open title="Smazat?" onClose={close} actions={<Button>OK</Button>} />
```

### React 19 — žádný forwardRef
```tsx
// ✅ React 19 ref-as-prop
function Button({ ref, ...props }: ButtonProps & { ref?: React.Ref<HTMLButtonElement> }) { ... }

// ❌ zastaralé a zakázané
const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => { ... })
```

### Testid enum
```ts
// Každá komponenta má vlastní enum, žádné volné stringy
export enum ButtonTestId { Root = 'button-root', Icon = 'button-icon' }
```

### asChild / polymorfismus
Nepoužíváme `asChild`. Polymorfismus přes `as?: NarrowUnion` prop.

---

## Dashboard chrome (v DS, router-agnostic)

`DashboardShell`, `Sidebar`, `TopBar`, `ContextSwitch` zůstávají v DS.
Nesmí importovat `next/link`/`usePathname` — Storybook nemá Next router.
Sidebar přijímá `linkComponent?` prop (default = `<button>`), appka předá `<Link>`.

---

## Doménové kompozity (v appce)

Komponenty importující `AgentDef`/`Pipeline`/`Skill`/`Integration`/`Approval`/`ActivityEvent`/`ClaudeLimits`
žijí v `apps/web/features/<doména>/components/`.

Domain typy (pouze typy, ne implementace) zůstávají v DS `domain.ts`.

---

## Routing

App Router route group `(dashboard)`. Context home/work = `?ctx=work` query param.
- `/` → redirect na `/overview`
- `/(dashboard)/layout.tsx` — server layout: Providers + `DashboardChrome`
- `DashboardChrome` — `"use client"`, čte `useSearchParams()` (pod `<Suspense>`), poskytuje `DashboardContext`
- Každá stránka = `page.tsx` ve svém segmentu
- `/pipelines/[id]` — detail pipeline (klientský, čte `useDashboardStore()`)
- `hrefWithCtx(href, ctx)` — helper připínající `?ctx=` na nav linky

---

## i18n (next-intl)

- Locale v cookie, bez path-prefixu: `i18n/request.ts` čte `cookies().get('locale')`
- `NextIntlClientProvider` v root `app/layout.tsx`
- Server: `getTranslations()`, klient: `useTranslations()`
- Katalogy: `apps/web/messages/{cs,en}.json`, ploché klíče `t('Key', { sub: 1 })`
- DS je i18n-agnostický — string props s anglickými defaulty, appka přepíše `t()`

---

## TanStack Query

Hooky žijí per-doména v `apps/web/features/<doména>/queries.ts`, ne v `libs/`.

---

## TypeScript

- `strict: true` + `noUncheckedIndexedAccess`
- Žádné `any` — použij `unknown`, `satisfies`, nebo generiku
- Props interface: `<Component>Props`, vždy exportovat
- Typy vedle implementace (ne v separátním `types.ts`, pokud nejsou sdílené)

---

## Testy

Vitest + `@testing-library/react`. Kolokované soubory:
```
Button.tsx
Button.test.tsx    ← basic render, ref-as-prop, className merge, stavy, userEvent
Button.stories.tsx ← Overview (all variants) + Playground (all controls)
```

Přesunuté doménové kompozity: test wrapper `apps/web/test/renderWithIntl.tsx`.
**Stories jen pro DS** — přesunuté kompozity stories nemají.

---

## Storybook

Storybook jen pro `libs/design-system`. Story konvence:
```tsx
// 1. Overview — statický render všech variant
// 2. Playground — všechny props jako controls, event props { action: 'name' }
export default { tags: ['autodocs'] } satisfies Meta<typeof Component>
```
Toolbar: přepínač `theme` (dark/light) a `context` (home/work) přes `DesignSystemProvider` decorator.

---

## A11y baseline

- Kontrast: WCAG AA (4.5:1 běžný text, 3:1 velký text + UI)
- Focus ring: vždy viditelný; nikdy `outline:none` bez náhrady
- `aria-label`: povinný u icon buttonů a inputů bez viditelného labelu

---

## Co nikdy nedělat

- Psát `forwardRef` (jsme na React 19 — ref-as-prop)
- Používat `any` v TypeScriptu
- Psát Tailwind třídy mimo `libs/design-system` (výjimka: layout utilities v `app/`)
- Hardcodovat token hodnoty v komponentách (vždy `useTokens()` nebo `var(--)`)
- Přidávat query hooky do `libs/` bez jasného důvodu ke sdílení
- Commitovat `.claude/settings.local.json` (je v `.gitignore`)

---

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
