# Design system (@zibby/design-system)

**Path:** `libs/design-system/src/`
**Import alias:** `@zibby/design-system`
**Storybook:** `pnpm storybook` → `http://localhost:6006`

The design system is the **default source of UI primitives** for the whole
application. `apps/web` composes UI from the DS — it never writes its own
primitives.

## Architecture

```
libs/design-system/src/
├── tokens.ts                   Spacing, Size, Theme interface, spacingToPx
├── theme/globals.css           @theme Tailwind v4 CSS-first configuration
├── themes/
│   ├── darkTheme.ts            Default dark tokens
│   └── lightTheme.ts           Default light tokens
├── DesignSystemContext/
│   ├── DesignSystemProvider.tsx Provider (theme injection)
│   ├── hooks.ts                useTokens(), useSpacing()
│   ├── themeRegistry.ts        tokensForTheme(), defaultDark/LightTokens
│   └── index.ts
├── utils/
│   ├── cn.ts                   cn() helper (clsx + tailwind-merge)
│   ├── refs.ts                 mergeRefs()
│   └── testRender.tsx          renderWithTheme() for tests
└── components/                 All components
```

## Token system

### Spacing scale

Named spacing scale (`Spacing` type) → concrete px values:

| Token   | px   |
| ------- | ---- |
| `"0"`   | 0px  |
| `"25"`  | 2px  |
| `"50"`  | 4px  |
| `"75"`  | 6px  |
| `"100"` | 8px  |
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
type Size = "xs" | "sm" | "md" | "lg" | "xl";
```

Used by `Icon`, `Button`, and similar components for named sizes.

### Theme interface

A flat object — every visual token in one place.
`DesignSystemProvider` injects the values as CSS custom properties.
`globals.css`'s `@theme` maps Tailwind utility classes onto those same
properties.

Components use **only Tailwind classes** — `useTokens()` is reserved for
SVG/canvas, where JS needs raw values.

## DesignSystemProvider

```tsx
<DesignSystemProvider theme="dark">{children}</DesignSystemProvider>
```

Set to `theme="dark"` in `apps/web/app/providers.tsx`.

## Tailwind v4 (CSS-first)

The DS uses Tailwind v4 with `@theme` in `globals.css`:

```css
@theme {
  --color-background: var(--zibby-color-background);
  --color-border: var(--zibby-color-border);
  /* ... */
}
```

No `tailwind.config.js` — configuration lives entirely in CSS.

## Components

### Layout primitives

| Component   | Purpose                                                     |
| ----------- | ------------------------------------------------------------ |
| `Container` | Wrapper with max-width, padding, overflow, position, grow/shrink |
| `Stack`     | Flex column/row with gap                                     |
| `Grid`      | CSS Grid with cols, gap, align                               |
| `Spacer`    | Flex spacer                                                  |
| `Surface`   | Layered surface (background tier)                            |
| `Pressable` | Interactive wrapper (keyboard + mouse)                       |

### Typography

The `Typography` component covers headings, body text, caption, and
monospace.

### Buttons

| Component     | Purpose                                                      |
| ------------- | -------------------------------------------------------------- |
| `Button`      | Primary button (variant: solid/ghost/outline, size: xs–xl)     |
| `ButtonGroup` | Groups buttons together                                         |
| `HoldButton`  | Hold-to-confirm button (for destructive actions); a short press arms it and a second press confirms — timing-free a11y alternative to the hold |

### Form primitives

A handful of controls exist as bare, standalone components — `Checkbox`,
`Toggle`, and `DropZone` are used directly outside of forms as well as inside
them. Everything under `components/form/` is a **labeled field** wrapper: it
composes the shared `Field` primitive (label + hint + error chrome, with
`FieldLayout: "column" | "row"`) around the underlying control, for use with
`@zibby/forms` / React Hook Form:

```
form/
├── Field.tsx             Shared label/hint/error wrapper (FieldTestId, FieldLayout, SelectOption)
├── TextInputField/
├── TextAreaField/
├── HighlightTextAreaField/  (inline path/[[wikilink]] highlighting)
├── NumberField/
├── SelectField/
├── SegmentPickerField/    (segmented toggle)
├── SchedulePicker/        (repeat + weekdays / month-day + time → Schedule; cron translation lives in the app)
├── ScheduleField/         (SchedulePicker wrapped with Field chrome)
├── ToggleField/           (on/off switch)
├── DropZoneField/
└── FilePickerField/
```

`SchedulePicker` / `ScheduleField` are format-neutral — they emit a
structured `Schedule` (`repeat: "weekly" | "monthly"` + `time` +
`weekdays: number[]` (multi-select, 0 = Sunday) + `monthDay`); translation to
a cron string is the app's job (`apps/web/features/automations/schedule.ts`:
`scheduleToCron` / `cronToSchedule`).

### Feedback

| Component      | Purpose                                        |
| --------------- | ------------------------------------------------ |
| `Alert`         | Informational / warning / error banner            |
| `StatusDot`     | Status indicator (color + optional pulsing)       |
| `Progress`      | Linear progress bar                               |
| `ProgressRing`  | Circular progress                                 |
| `Sparkline`     | Miniature chart                                   |
| `Stat`          | Number + label + trend                           |
| `OrbitLoader`   | Loading indicator (orbiting dot + label, sizes sm/md/lg) |

### Navigation and data

| Component     | Purpose                    |
| ------------- | ---------------------------- |
| `Tabs`        | Tab navigation                |
| `Accordion`   | Collapsible section           |
| `List`        | Structured list                |
| `Dropdown`    | Dropdown menu (single, or `multi` — checkboxes in the options plus closable chips in the field; `showSelectAll` adds a "select/clear all" row) |
| `MenuSurface` | Surface for a menu overlay     |
| `SearchBar`   | Search input                   |
| `SearchMenu`  | Search with results            |

### Overlays and content

| Component        | Purpose                                          |
| ----------------- | --------------------------------------------------- |
| `Dialog`          | Modal dialog (`DialogWidth`: sm/md/lg/xl/full)      |
| `Panel`           | Drawer/panel                                        |
| `Card`            | Card with an optional header/footer                |
| `IconTile`        | Icon in a tile (size, color)                        |
| `CodeBlock`       | Code block with syntax highlighting                 |
| `Markdown`        | Read-only Markdown viewer (`@uiw/react-md-editor` under the hood) |
| `MarkdownEditor`  | Markdown editor + preview                           |
| `FilePreview`     | Uploaded/attached file preview (name, size, remove) |
| `Tooltip`         | Hover/focus tooltip                                 |
| `Tag`             | Colored tag/badge                                   |
| `Chip`            | Interactive chip (`closable` → an × + `onClose`)    |
| `Kbd`             | Keyboard shortcut                                   |
| `Divider`         | Horizontal/vertical divider                         |

### Icon

```tsx
<Icon name="chevron-right" size="md" />
```

`IconName` is a union of every available icon. Adding an icon means adding it
to the `IconName` type.

## Testing

Every DS component:

- Declares a `<Component>TestId` enum for its important parts
- Wires `data-testid` onto those parts
- Is tested via `getByTestId` (the primary selector)
- Keeps role/ARIA as **assertions** (`toHaveRole`, `toHaveAccessibleName`),
  never as selectors

```typescript
// Wrong ❌
const button = container.querySelector("button");

// Right ✅
const button = getByTestId(ButtonTestId.Root);
expect(button).toHaveRole("button");
```

Test helper: `renderWithTheme(component)` from `utils/testRender.tsx`

## Rules when working on the DS

- **No `forwardRef`** (React 19 — ref as a prop)
- **No inline `style={{}}` on DOM elements in `apps/web`** — ESLint
  (`react/forbid-dom-props`) forbids it
  - A dynamic value with no DS prop → use the DS component's `style`
    passthrough
  - Or, on a raw DOM/SVG node only, behind a
    `// eslint-disable-next-line react/forbid-dom-props`
- **No raw `<button>` outside the DS** (use `Button` or `Pressable`)
- **No custom Tailwind classes in `apps/web`** — the app imports from the DS,
  it never writes its own

## cn() helper

```typescript
import { cn } from "@zibby/design-system";

cn("base-class", isActive && "active", className);
// clsx + tailwind-merge: safely combines classes without duplication
```
