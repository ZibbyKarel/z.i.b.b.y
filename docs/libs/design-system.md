# Design system (@zibby/design-system)

**Cesta:** `libs/design-system/src/`  
**Importní alias:** `@zibby/design-system`  
**Storybook:** `pnpm storybook` → `http://localhost:6006`

Design system je **výchozí zdroj UI primitiv** pro celou aplikaci.
`apps/web` komponuje UI z DS — nikdy nepíše vlastní primitiva.

## Architektura

```
libs/design-system/src/
├── tokens.ts                   Spacing, Size, Theme interface, spacingToPx
├── theme/globals.css            @theme Tailwind v4 CSS-first konfigurace
├── themes/
│   ├── darkTheme.ts            Výchozí dark tokeny
│   └── lightTheme.ts           Výchozí light tokeny
├── DesignSystemContext/
│   ├── DesignSystemProvider.tsx Provider (theme injection)
│   ├── hooks.ts                useTokens(), useSpacing()
│   ├── themeRegistry.ts        tokensForTheme(), defaultDark/LightTokens
│   └── index.ts
├── utils/
│   ├── cn.ts                   cn() helper (clsx + tailwind-merge)
│   ├── refs.ts                 mergeRefs()
│   └── testRender.tsx          renderWithTheme() pro testy
└── components/                 Všechny komponenty
```

## Token systém

### Spacing scale

Named spacing scale (`Spacing` type) → konkrétní px hodnoty:

| Token | px |
|-------|----|
| `"0"` | 0px |
| `"25"` | 2px |
| `"50"` | 4px |
| `"75"` | 6px |
| `"100"` | 8px |
| `"150"` | 12px |
| `"200"` | 16px |
| `"250"` | 20px |
| `"300"` | 24px |
| `"350"` | 28px |
| `"400"` | 32px |
| `"450"` | 36px |
| `"500"` | 40px |

### Size enum

```typescript
type Size = "xs" | "sm" | "md" | "lg" | "xl"
```

Používá ho `Icon`, `Button` a podobné komponenty pro pojmenované velikosti.

### Theme interface

Flat objekt — všechny vizuální tokeny na jednom místě.
`DesignSystemProvider` injectuje hodnoty jako CSS custom properties.
`globals.css` `@theme` mapuje Tailwind utility classes na ty samé proměnné.

Komponenty používají **jen Tailwind classes** — `useTokens()` jen pro SVG/canvas (JS musí raw hodnoty).

## DesignSystemProvider

```tsx
<DesignSystemProvider theme="dark">
  {children}
</DesignSystemProvider>
```

Nastaveno na `theme="dark"` v `apps/web/app/providers.tsx`.

## Tailwind v4 (CSS-first)

DS používá Tailwind v4 s `@theme` v `globals.css`:

```css
@theme {
  --color-background: var(--zibby-color-background);
  --color-border: var(--zibby-color-border);
  /* ... */
}
```

Žádné `tailwind.config.js` — konfigurace je čistě v CSS.

## Komponenty

### Layout primitives

| Komponenta | Účel |
|-----------|------|
| `Container` | Obal s max-width, padding, overflow, position, grow/shrink |
| `Stack` | Flex column/row s gap |
| `Grid` | CSS Grid s cols, gap, align |
| `Spacer` | Flex spacer |
| `Surface` | Vrstvená plocha (background tier) |
| `Pressable` | Interaktivní wrapper (keyboard + mouse) |

### Typografie

`Typography` komponenta pro nadpisy, body text, caption, monospace.

### Tlačítka

| Komponenta | Účel |
|-----------|------|
| `Button` | Hlavní tlačítko (variant: solid/ghost/outline, size: xs-xl) |
| `ButtonGroup` | Skupinování tlačítek |
| `HoldButton` | Tlačítko s potvrzením podržením (pro destruktivní akce) |

### Formulářové prvky (form/)

```
form/
├── TextInput/
├── Textarea/
├── Select/
├── Toggle/       (checkbox/switch)
└── DropZone/
```

### Feedback

| Komponenta | Účel |
|-----------|------|
| `Alert` | Informační / warning / error banner |
| `StatusDot` | Stavový indikátor (barva + volitelný pulsing) |
| `Progress` | Lineární progress bar |
| `ProgressRing` | Kruhový progress |
| `Sparkline` | Miniaturní chart |
| `Stat` | Číslo + label + trend |

### Navigace a data

| Komponenta | Účel |
|-----------|------|
| `Tabs` | Tab navigace |
| `Accordion` | Collapsible sekce |
| `List` | Strukturovaný seznam |
| `Dropdown` | Dropdown menu |
| `MenuSurface` | Surface pro menu overlay |
| `SearchBar` | Input pro search |
| `SearchMenu` | Search s výsledky |

### Overlays a obsah

| Komponenta | Účel |
|-----------|------|
| `Dialog` | Modal dialog (DialogWidth: sm/md/lg/xl/full) |
| `Panel` | Drawer/panel |
| `Card` | Karta s volitelným header/footer |
| `IconTile` | Ikona v dlaždici (size, color) |
| `CodeBlock` | Code block s highlighting |
| `MarkdownEditor` | Markdown editor + preview |
| `Tag` | Barevný tag/badge |
| `Chip` | Interaktivní chip |
| `Kbd` | Klávesová zkratka |
| `Divider` | Horizontální/vertikální oddělovač |

### Icon

```tsx
<Icon name="chevron-right" size="md" />
```

`IconName` type je union všech dostupných ikon. Přidání ikony = přidání do `IconName` type.

## Testování

Každá DS komponenta:
- Deklaruje `<Component>TestId` enum pro důležité části
- Drátem `data-testid` na ty části
- Testy selektují přes `getByTestId` (primární selektor)
- Role/ARIA jsou **aserce** (`toHaveRole`, `toHaveAccessibleName`), ne selektory

```typescript
// Špatně ❌
const button = container.querySelector("button")

// Správně ✅
const button = getByTestId(ButtonTestId.Root)
expect(button).toHaveRole("button")
```

Test helper: `renderWithTheme(component)` z `utils/testRender.tsx`

## Zákazy při práci s DS

- **Žádný `forwardRef`** (React 19 — ref jako prop)
- **Žádné inline `style={{}}` na DOM elementech v `apps/web`** — ESLint (`react/forbid-dom-props`)
  - Dynamická hodnota bez DS prop → DS komponent's `style` passthrough
  - Nebo na raw DOM/SVG za `// eslint-disable-next-line react/forbid-dom-props`
- **Žádné raw `<button>` mimo DS** (použij `Button` nebo `Pressable`)
- **Žádné vlastní Tailwind třídy v `apps/web`** — app importuje z DS, sám nepíše

## cn() helper

```typescript
import { cn } from "@zibby/design-system"

cn("base-class", isActive && "active", className)
// clsx + tailwind-merge: bezpečné kombinování classů bez duplikace
```
