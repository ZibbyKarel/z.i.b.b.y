# Immersive Chrome (Velín-D phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the global color system in line with the Velín-D `ZT` palette and redesign the `/chat` top panel, add a right-side HUD tool dock, and rebuild the left task list as floating glass cards — parking at the PR gate.

**Architecture:** Tokens land first (every surface inherits them). One new DS primitive (`GlassSurface`) carries the shared "liquid glass" recipe so no `apps/web` DOM node hand-rolls `backdrop-filter`. The three chrome regions (`ChatTopBar`, `ChatToolDock`, floating task cards) are built as independent app components, then wired into `ChatScreen` with the two displaced controls (New-chat, Voice) relocated to the composer. i18n catalogs are completed and verified, then everything is proven live on `:3000`.

**Tech Stack:** Next.js 15 App Router, React 19 (ref-as-prop, no `forwardRef`), TypeScript strict, Tailwind v4 CSS-first `@theme`, `@zibby/design-system`, `@zibby/contracts` (ts-rest + Zod), TanStack Query, next-intl, Vitest, Storybook, pnpm + rtk.

## Global Constraints

- **Palette is `ZT`** (`.superpowers/sdd2/design-analysis.md §1`), verbatim: bg `#0b0e13`, surface `#10151c`, surfaceHi `#151c25`, ink `#e6edf3` / ink2 `#9aa7b4` / ink3 `#66737f`, accent `#5b8def` / accentDim `rgba(91,141,239,0.14)`, ok `#3fcf8e`, run `#7aa5f8`, wait `#f0b429`, bad `#ff6b6b`, riskPay `#f0b429`, riskDel `#ff6b6b`, riskPush `#b07cff`, riskSend `#56c4d6`, radii 6 (controls) / 10 (panels).
- **Glass recipe (verbatim):** `linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02) 40%, rgba(16,21,28,0.5))`; blur `blur(22px) saturate(180%)`; border `1px solid rgba(255,255,255,0.12)`; shadow `inset 0 1px 0 rgba(255,255,255,0.13), 0 16px 40px rgba(0,0,0,0.42)`. Scene gradient `radial-gradient(ellipse 130% 100% at 50% 42%, #121a27 0%, #0b0e13 62%)`.
- **English-only identifiers/comments/keyframes — including test fixtures/literals.** No "velin"/Czech in source outside the i18n catalogs. Every user-visible string via next-intl; keys in `apps/web/i18n/messages/{cs,en}.json` (Czech copy from `design-analysis.md §6`, sensible English). DS components stay i18n-agnostic (English-default string props).
- **i18n catalog edits land ONLY in Task 7.** Tasks 3/4/5 must not touch `cs.json`/`en.json` (they run in parallel — concurrent edits to the same two files would lose updates). Components reference existing keys where they exist; a key that is new this phase renders as its key-path in component tests (next-intl missing-key fallback) until Task 7 lands it.
- **Token value changes land in every mirror** (`current-state.md §1`): `libs/design-system/src/theme/globals.css`, `libs/design-system/src/themes/darkTheme.ts`, `libs/design-system/src/stateTone.ts`, `libs/design-system/src/immersive/orbState.ts`. New `Theme` keys additionally touch `libs/design-system/src/tokens.ts` (the explicit all-required `Theme` interface + `tokensToCssVars()`) **and** `libs/design-system/src/themes/lightTheme.ts` (typed `: Theme`, so required keys must exist there too — same values; the app is dark-only).
- **No inline `style={{}}` on a DOM node in `apps/web`** (`react/forbid-dom-props`). Glass surfaces are the DS `GlassSurface` component; dynamic values go through a DS component's `style` passthrough.
- **Repo laws:** pnpm + `rtk` prefix (even in `&&` chains); React 19 no `forwardRef`; no `any`; DS TestId enums + `getByTestId` (roles/ARIA as assertions only); never `--no-verify`; don't kill the `:3000` dev server; don't commit `.zibby/data/system-config.json`.
- **Three gates after any codegen, in order:** `rtk pnpm check:lint` → `rtk pnpm check:types` **and** `pnpm exec tsc -p apps/web --noEmit` (base config misses `apps/web`) → `pnpm test`. Fix all before moving on.
- **PARK at the PR gate:** commit on `feat/immersive-chrome`; never push, never open a PR without explicit operator instruction.
- **Data reality (do not invent):** a `RunView` has no subsystem id → task-card tone = `runStateTone(run.status) ?? "accent"` (**`runStateTone` returns `StateTone | undefined` — always default explicitly**), rendered via `Card`'s built-in `edge={tone}` prop. Status-pill counts come from `useSubsystemsQuery`. Reuse `LimitsRings` for the gauge; reuse the settings locale mechanism (`document.cookie = "locale=<v>; path=/; max-age=31536000"` + `router.refresh()`).

---

## Task sequencing & parallelism

| # | Task | Depends on | Parallel-safe with |
|---|---|---|---|
| 1 | Global color-token alignment | — | (none — foundation, run first) |
| 2 | `GlassSurface` DS primitive | 1 | — |
| 3 | Top panel (`ChatTopBar` + `LangSwitch`) | 1, 2 | 4, 5 |
| 4 | Right tool dock (`ChatToolDock`) | 1, 2 | 3, 5 |
| 5 | Left floating task cards | 1, 2 | 3, 4 |
| 6 | `ChatScreen` integration + relocate New-chat/Voice + insets | 3, 4, 5 | — |
| 7 | i18n catalog completion + cs/en parity test | 3, 4, 5 | 6 |
| 8 | Final gates + Storybook smoke + live `:3000` verify (PARK) | all | — |

Tasks 3, 4, 5 are independent app components and are parallel-safe **because all i18n
catalog edits are consolidated in Task 7** — with that rule, their file sets are disjoint.
Task 7 must run after 3/4/5 (it needs the final set of referenced keys).

---

### Task 1: Global color-token alignment

**Files:**
- Modify: `libs/design-system/src/tokens.ts` (4 glass keys on the `Theme` interface + `tokensToCssVars()` mappings)
- Modify: `libs/design-system/src/themes/darkTheme.ts` (foreground-faint drift + 4 glass values)
- Modify: `libs/design-system/src/themes/lightTheme.ts` (the same 4 glass values — `Theme` is all-required and lightTheme is typed `: Theme`; the app is dark-only so the dark-tuned recipe is acceptable there)
- Modify: `libs/design-system/src/theme/globals.css` (add 4 glass tokens to `@theme`)
- Modify: `libs/contracts/src/subsystems/subsystem.schema.ts` (recolor 8 `SUBSYSTEMS[].color`)
- Verify (assert, no change): `libs/design-system/src/stateTone.ts`, `libs/design-system/src/immersive/orbState.ts`
- Test: `libs/design-system/src/themes/darkTheme.test.ts` (create if absent), `libs/contracts/src/subsystems/subsystems.contract.test.ts` (update fixtures)

**Interfaces:**
- Produces (consumed by Task 2 and all chrome): required `Theme` keys `gradientGlass`, `colorGlassBorder`, `shadowGlass`, `blurGlass` (all `string`), injected at runtime by `DesignSystemProvider` via `tokensToCssVars()` as CSS custom properties `--gradient-glass`, `--color-glass-border`, `--shadow-glass`, `--blur-glass` (also declared in the `globals.css` `@theme` block as the SSR default).
- Produces: `SUBSYSTEMS[].color` recolored to ZT hues (unchanged shape/type).

- [ ] **Step 1: Write/extend the failing token test**

Create or extend `libs/design-system/src/themes/darkTheme.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { darkTheme } from "./darkTheme";

describe("darkTheme ZT alignment", () => {
  it("uses the ZT tertiary ink for foreground-faint", () => {
    expect(darkTheme.colorForegroundFaint).toBe("#66737f");
  });

  it("exposes the VD glass recipe tokens", () => {
    expect(darkTheme.gradientGlass).toBe(
      "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02) 40%, rgba(16,21,28,0.5))",
    );
    expect(darkTheme.colorGlassBorder).toBe("rgba(255,255,255,0.12)");
    expect(darkTheme.shadowGlass).toBe(
      "inset 0 1px 0 rgba(255,255,255,0.13), 0 16px 40px rgba(0,0,0,0.42)",
    );
    expect(darkTheme.blurGlass).toBe("blur(22px) saturate(180%)");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `rtk vitest run libs/design-system/src/themes/darkTheme.test.ts`
Expected: FAIL — `colorForegroundFaint` is `#7a8793`; glass keys are `undefined`.

- [ ] **Step 3: Add the four glass keys to the `Theme` interface and `tokensToCssVars()` in `tokens.ts`**

The `Theme` interface (`tokens.ts:71`) is explicit and **all-required**; both `darkTheme.ts` and `lightTheme.ts` are typed `: Theme`. Add to the interface (near `shadowGlowAccent`):
```ts
  /** Liquid-glass chrome recipe (Velín-D VD_GLASS), consumed by GlassSurface. */
  gradientGlass: string;
  colorGlassBorder: string;
  shadowGlass: string;
  blurGlass: string;
```
And add the mappings inside `tokensToCssVars()` (`tokens.ts:156+`, near `"--shadow-glow-accent"`), so `DesignSystemProvider` injects them at runtime and the vars never depend on Tailwind emitting a non-standard `@theme` namespace:
```ts
    // liquid glass (GlassSurface)
    "--gradient-glass": t.gradientGlass,
    "--color-glass-border": t.colorGlassBorder,
    "--shadow-glass": t.shadowGlass,
    "--blur-glass": t.blurGlass,
```

- [ ] **Step 4: Reconcile the faint drift + add glass values in `darkTheme.ts` AND `lightTheme.ts`**

In `darkTheme.ts`: change `colorForegroundFaint: "#7a8793"` → `colorForegroundFaint: "#66737f"`, and add near the shadows block:
```ts
  // liquid-glass chrome recipe (Velín-D VD_GLASS), consumed by GlassSurface
  gradientGlass:
    "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02) 40%, rgba(16,21,28,0.5))",
  colorGlassBorder: "rgba(255,255,255,0.12)",
  shadowGlass: "inset 0 1px 0 rgba(255,255,255,0.13), 0 16px 40px rgba(0,0,0,0.42)",
  blurGlass: "blur(22px) saturate(180%)",
```
In `lightTheme.ts`: add the **identical four lines** (the `Theme` type requires them; the app mounts dark-only, so a light-tuned glass recipe is deliberately out of scope — note this in a one-line comment above the block).

- [ ] **Step 5: Add the matching tokens to the `@theme` block in `globals.css`**

Insert after `--color-surface-glass: rgba(16, 21, 28, 0.5);` (line ~48) and in the shadow block:
```css
  --gradient-glass: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02) 40%, rgba(16,21,28,0.5));
  --color-glass-border: rgba(255,255,255,0.12);
  --shadow-glass: inset 0 1px 0 rgba(255,255,255,0.13), 0 16px 40px rgba(0,0,0,0.42);
  --blur-glass: blur(22px) saturate(180%);
```

- [ ] **Step 6: Recolor the eight subsystem hues**

In `libs/contracts/src/subsystems/subsystem.schema.ts` `SUBSYSTEMS`, set `color` per id:
`forge #5b8def`, `herald #56c4d6`, `sentinel #34c9bd`, `scout #46cf8b`, `maestro #e0a83c`, `beacon #f4785c`, `puls #f2749e`, `loom #b07cff`. (Regex `^#[0-9a-f]{6}$/i` accepts all.) Update any fixture in `subsystems.contract.test.ts` that asserts an old hex.

- [ ] **Step 7: Assert the untouched mirrors already match ZT**

Confirm by reading (no edit expected): `stateTone.ts` `stateToneHex` = accent `#5b8def`, ok `#3fcf8e`, warn `#f0b429`, bad `#ff6b6b`, run `#7aa5f8`; `orbState.ts` `ORB_STATE_COLOR` = working `#7aa5f8`, report `#3fcf8e`, await `#f0b429`, incident `#ff6b6b`, thinking `#5b8def`. If either drifts, fix to these values here.

- [ ] **Step 8: Run tests to verify pass**

Run: `rtk vitest run libs/design-system/src/themes/darkTheme.test.ts libs/contracts/src/subsystems`
Expected: PASS.

- [ ] **Step 9: Gates**

Run: `rtk pnpm check:lint && rtk pnpm check:types && pnpm exec tsc -p apps/web --noEmit`
Expected: clean — in particular `lightTheme.ts` typechecks against the extended `Theme`.

- [ ] **Step 10: Commit**

```bash
rtk git add libs/design-system libs/contracts && rtk git commit -m "feat(tokens): align palette with ZT + add glass tokens + subsystem hues"
```

---

### Task 2: `GlassSurface` DS primitive

**Files:**
- Create: `libs/design-system/src/immersive/GlassSurface/GlassSurface.tsx`
- Create: `libs/design-system/src/immersive/GlassSurface/GlassSurface.test.tsx`
- Create: `libs/design-system/src/immersive/GlassSurface/GlassSurface.stories.tsx`
- Modify: `libs/design-system/src/immersive/index.ts` (export)
- Modify: `libs/design-system/src/index.ts` (re-export if the immersive bundle is surfaced there)

**Interfaces:**
- Consumes (Task 1): `--gradient-glass`, `--color-glass-border`, `--shadow-glass`, `--blur-glass`.
- Produces (Tasks 3–5): `GlassSurface` React component + `GlassSurfaceProps` + `GlassSurfaceTestId`.
```ts
export interface GlassSurfaceProps {
  radius?: "control" | "panel" | "pill"; // 6px | 10px | 9999px; default "panel"
  children?: React.ReactNode;
  style?: React.CSSProperties;            // merge passthrough for dynamic values
  "data-testid"?: string;
}
export enum GlassSurfaceTestId { Root = "glass-surface" }
```

- [ ] **Step 1: Write the failing test**

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GlassSurface, GlassSurfaceTestId } from "./GlassSurface";

describe("GlassSurface", () => {
  it("renders children on a glass root", () => {
    const { getByTestId } = render(<GlassSurface>hi</GlassSurface>);
    const root = getByTestId(GlassSurfaceTestId.Root);
    expect(root).toHaveTextContent("hi");
    expect(root.style.backgroundImage || root.style.background).toContain("gradient-glass");
  });

  it("maps radius='pill' to the full radius", () => {
    const { getByTestId } = render(<GlassSurface radius="pill">x</GlassSurface>);
    expect(getByTestId(GlassSurfaceTestId.Root).style.borderRadius).toBe("9999px");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `rtk vitest run libs/design-system/src/immersive/GlassSurface`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
"use client";

import type { CSSProperties, ReactNode } from "react";

export enum GlassSurfaceTestId {
  Root = "glass-surface",
}

export interface GlassSurfaceProps {
  /** Corner rounding: control 6px · panel 10px · pill 9999px. Defaults to "panel". */
  radius?: "control" | "panel" | "pill";
  children?: ReactNode;
  /** Merge passthrough for genuinely dynamic values (position, width). */
  style?: CSSProperties;
  "data-testid"?: string;
}

const RADIUS_PX: Record<NonNullable<GlassSurfaceProps["radius"]>, string> = {
  control: "6px",
  panel: "10px",
  pill: "9999px",
};

/**
 * The Velín-D "liquid glass" surface: a translucent, blurred pane over the scene
 * gradient. The single home of the VD_GLASS recipe so no app node hand-rolls
 * backdrop-filter. Immersive-bundle convention: inline style is allowed here (the
 * forbid-dom-props rule targets apps/web, not the DS). Unlike its animated bundle
 * siblings it does NOT call ensureImmersiveCss() — that injector exists for the
 * im* keyframes, and this component uses no animation.
 */
export function GlassSurface({
  radius = "panel",
  children,
  style,
  "data-testid": testId = GlassSurfaceTestId.Root,
}: GlassSurfaceProps) {
  return (
    <div
      data-testid={testId}
      style={{
        background: "var(--gradient-glass)",
        backdropFilter: "var(--blur-glass)",
        WebkitBackdropFilter: "var(--blur-glass)",
        border: "1px solid var(--color-glass-border)",
        boxShadow: "var(--shadow-glass)",
        borderRadius: RADIUS_PX[radius],
        ...style,
      }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk vitest run libs/design-system/src/immersive/GlassSurface`
Expected: PASS. (If jsdom normalizes `background` differently, assert on `root.style.background`/`backgroundImage` containing `var(--gradient-glass)` — adjust the test assertion, not the component.)

- [ ] **Step 5: Add the Storybook story**

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { GlassSurface } from "./GlassSurface";

const meta: Meta<typeof GlassSurface> = { title: "Immersive/GlassSurface", component: GlassSurface };
export default meta;

export const Pill: StoryObj<typeof GlassSurface> = {
  args: { radius: "pill", children: "⌘K  Hledat…" },
};
export const Panel: StoryObj<typeof GlassSurface> = {
  args: { radius: "panel", children: "Tool dock" },
};
```

- [ ] **Step 6: Export**

Add to `libs/design-system/src/immersive/index.ts`:
```ts
export { GlassSurface, GlassSurfaceTestId } from "./GlassSurface/GlassSurface";
export type { GlassSurfaceProps } from "./GlassSurface/GlassSurface";
```
Mirror in `libs/design-system/src/index.ts` if the top-level barrel re-exports immersive components.

- [ ] **Step 7: Gates**

Run: `rtk pnpm check:lint && rtk pnpm check:types && pnpm exec tsc -p apps/web --noEmit && rtk vitest run libs/design-system/src/immersive/GlassSurface`
Expected: clean + PASS.

- [ ] **Step 8: Commit**

```bash
rtk git add libs/design-system && rtk git commit -m "feat(ds): GlassSurface immersive primitive"
```

---

### Task 3: Top panel — `ChatTopBar` + `LangSwitch`

**Files:**
- Create: `apps/web/features/chat/components/ChatTopBar.tsx`
- Create: `apps/web/features/chat/components/ChatTopBar.test.tsx`
- Create: `apps/web/features/chat/components/LangSwitch.tsx`
- Create: `apps/web/features/chat/components/LangSwitch.test.tsx`
- Reuse (no change): `apps/web/features/chat/components/StatusPill.tsx`, `apps/web/components/layout/LimitsRings/LimitsRings.tsx`, DS `SearchBar`, `StatusDot`, `Icon`, `Typography`, `ButtonGroup`
- i18n: **no catalog edits in this task** (Task 7 owns all catalog work). This task only references existing keys: `chat.modeLabel`, `chat.palette.placeholder`, `topbar.langSwitcherLabel` (already shipped — do not mint a `chat.langSwitch.*` duplicate)

**Interfaces:**
- Consumes (Task 2): `GlassSurface`, `GlassSurfaceTestId`.
- Consumes existing: `StatusPill`, `LimitsRings`, `useLocale` (next-intl), `useRouter` (`next/navigation`), `useNow` (`apps/web/hooks/useNow`).
- Produces (Task 6):
```ts
export interface ChatTopBarProps {
  mode: ChatMode;                 // from ../chatMode (existing)
  onOpenPalette: () => void;      // opens the ⌘K ChatPalette (search trigger)
}
export enum ChatTopBarTestId {
  Root = "chat-top-bar",
  Mode = "chat-top-bar-mode",
  Search = "chat-top-bar-search",
  Lang = "chat-top-bar-lang",
  Clock = "chat-top-bar-clock",
}
```
- Produces: `LangSwitch` component + `LangSwitchTestId { Root = "chat-lang-switch" }`.

- [ ] **Step 1: Write the failing `LangSwitch` test**

```tsx
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/renderWithProviders";
import { LangSwitch, LangSwitchTestId } from "./LangSwitch";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("LangSwitch", () => {
  it("writes the locale cookie and refreshes on change", async () => {
    const { getByText } = renderWithProviders(<LangSwitch />);
    await userEvent.click(getByText("English"));
    expect(document.cookie).toContain("locale=en");
    expect(refresh).toHaveBeenCalled();
  });

  it("ignores the empty value ButtonGroup emits when the active option is re-clicked", async () => {
    const { getByText } = renderWithProviders(<LangSwitch />);
    // Default locale in tests is "cs"; clicking the active option can emit "".
    await userEvent.click(getByText("Čeština"));
    expect(document.cookie).not.toContain("locale=;");
  });
});
```
(Use the project's `renderWithProviders` — it supplies `NextIntlClientProvider` + DS provider; see `apps/web/test/render`.)

- [ ] **Step 2: Run it to verify it fails**

Run: `rtk vitest run apps/web/features/chat/components/LangSwitch.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `LangSwitch`**

```tsx
"use client";

import { ButtonGroup, GlassSurface } from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

export enum LangSwitchTestId {
  Root = "chat-lang-switch",
}

type Locale = "cs" | "en";

function isLocale(value: string): value is Locale {
  return value === "cs" || value === "en";
}

/** Module-scoped so the cookie write isn't analysed as an in-render mutation
 * (same pattern as features/settings/Screen.tsx). */
function writeLocaleCookie(value: Locale) {
  document.cookie = `locale=${value}; path=/; max-age=31536000`;
}

/** Glass-pill language switch. Reuses the settings locale mechanism exactly:
 * cookie write + router.refresh() so i18n/request.ts re-reads on the next render.
 * ButtonGroup emits "" when the active option is toggled off — guarded, no-op. */
export function LangSwitch() {
  // Reuses the shipped top-bar label key — no new catalog entry.
  const t = useTranslations("topbar");
  const locale = useLocale() as Locale;
  const router = useRouter();

  const setLocale = (value: string) => {
    if (!isLocale(value) || value === locale) return;
    writeLocaleCookie(value);
    router.refresh();
  };

  return (
    <GlassSurface radius="pill" data-testid={LangSwitchTestId.Root}>
      <ButtonGroup
        ariaLabel={t("langSwitcherLabel")}
        onChange={setLocale}
        options={[
          { id: "cs", label: "Čeština" },
          { id: "en", label: "English" },
        ]}
        value={locale}
      />
    </GlassSurface>
  );
}
```

- [ ] **Step 4: Run `LangSwitch` test to verify pass**

Run: `rtk vitest run apps/web/features/chat/components/LangSwitch.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing `ChatTopBar` test**

```tsx
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/renderWithProviders";
import { ChatTopBar, ChatTopBarTestId } from "./ChatTopBar";

describe("ChatTopBar", () => {
  it("renders the glass top bar with search, lang and clock, and no close button", () => {
    const { getByTestId, queryByTestId } = renderWithProviders(
      <ChatTopBar mode="idle" onOpenPalette={vi.fn()} />,
    );
    expect(getByTestId(ChatTopBarTestId.Root)).toBeInTheDocument();
    expect(getByTestId(ChatTopBarTestId.Search)).toBeInTheDocument();
    expect(getByTestId(ChatTopBarTestId.Lang)).toBeInTheDocument();
    expect(getByTestId(ChatTopBarTestId.Clock)).toBeInTheDocument();
    // Close button was removed from the top bar this phase.
    expect(queryByTestId("chat-screen-close")).toBeNull();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `rtk vitest run apps/web/features/chat/components/ChatTopBar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `ChatTopBar`**

Compose from DS + reused components; every glass region is a `GlassSurface radius="pill"`. Left group = butler sign + mode label + `StatusDot` (keep `data-testid="chat-screen-mode-dot"`, tone/pulse from `MODE_DOT[mode]`). Center = `StatusPill` wrapped in glass + search-trigger glass pill. `SearchBarProps` is `{ placeholder, ariaLabel (required), shortcut?, title?, onClick? }` — it renders its **own** `<kbd>` from the `shortcut` string; there is no `trailing` prop and no `Kbd` composition. Right = `<GlassSurface radius="pill"><LimitsRings /></GlassSurface>` (the `LimitsRings` trigger is `Pressable`+`Container`, no own `Card`, so this does not double-surface — its popover `Card` floats; eyeball in the Task 8 live pass) + `LangSwitch` (assert `ChatTopBarTestId.Lang` on its glass wrapper) + clock `Typography mono` (`data-testid={ChatTopBarTestId.Clock}`, `useNow(MINUTE_MS)`, `HH:MM`). The bar wrapper is a `Stack direction="row"`; **no inline style on a raw div**. No `border-b`. Skeleton:
```tsx
"use client";

import {
  GlassSurface, Icon, SearchBar, Stack, StatusDot, Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { LimitsRings } from "../../../components/layout/LimitsRings/LimitsRings";
import { useNow } from "../../../hooks/useNow";
import type { ChatMode } from "../chatMode";
import { MODE_DOT } from "../chatMode";
import { LangSwitch } from "./LangSwitch";
import { StatusPill } from "./StatusPill";

export enum ChatTopBarTestId {
  Root = "chat-top-bar",
  Mode = "chat-top-bar-mode",
  Search = "chat-top-bar-search",
  Lang = "chat-top-bar-lang",
  Clock = "chat-top-bar-clock",
}

export interface ChatTopBarProps {
  mode: ChatMode;
  onOpenPalette: () => void;
}

const MINUTE_MS = 60_000;

export function ChatTopBar({ mode, onOpenPalette }: ChatTopBarProps) {
  const t = useTranslations("chat");
  const now = useNow(MINUTE_MS);
  const dot = MODE_DOT[mode];
  const clock = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(now);

  return (
    <Stack align="center" direction="row" gap="150" data-testid={ChatTopBarTestId.Root}>
      <Stack align="center" direction="row" gap="100" data-testid={ChatTopBarTestId.Mode}>
        <Icon name="butlerSign" />
        <Typography mono size="xs" tracking="wide" type="note" variant="secondary">
          {t("modeLabel")}
        </Typography>
        <StatusDot data-testid="chat-screen-mode-dot" pulse={dot.pulse} tone={dot.tone} />
      </Stack>

      <GlassSurface radius="pill"><StatusPill /></GlassSurface>

      <GlassSurface radius="pill" data-testid={ChatTopBarTestId.Search}>
        <SearchBar
          ariaLabel={t("palette.placeholder")}
          onClick={onOpenPalette}
          placeholder={t("palette.placeholder")}
          shortcut="⌘K"
        />
      </GlassSurface>

      <GlassSurface radius="pill"><LimitsRings /></GlassSurface>

      <GlassSurface radius="pill" data-testid={ChatTopBarTestId.Lang}><LangSwitch /></GlassSurface>

      <Typography data-testid={ChatTopBarTestId.Clock} mono size="xs" type="note" variant="secondary">
        {clock}
      </Typography>
    </Stack>
  );
}
```
The `SearchBar` usage above matches its real signature (`ariaLabel` required, `shortcut` string, `onClick`). Adapt `StatusDot`/`Typography`/`MODE_DOT` prop names to their actual signatures (read them; do not guess). Keep the exact behavior: the pill opens the existing `ChatPalette`. Do **not** edit the i18n catalogs in this task.

- [ ] **Step 8: Run `ChatTopBar` test to verify pass**

Run: `rtk vitest run apps/web/features/chat/components/ChatTopBar.test.tsx`
Expected: PASS.

- [ ] **Step 9: Gates**

Run: `rtk pnpm check:lint && rtk pnpm check:types && pnpm exec tsc -p apps/web --noEmit && rtk vitest run apps/web/features/chat/components/ChatTopBar.test.tsx apps/web/features/chat/components/LangSwitch.test.tsx`
Expected: clean + PASS.

- [ ] **Step 10: Commit**

```bash
rtk git add apps/web && rtk git commit -m "feat(chat): glass top bar + language switch"
```

---

### Task 4: Right tool dock — `ChatToolDock`

**Files:**
- Create: `apps/web/features/chat/components/ChatToolDock.tsx`
- Create: `apps/web/features/chat/components/ChatToolDock.test.tsx`
- Reuse (no change): `apps/web/state/config.ts` (`NAV_ITEMS`, `SETTINGS_ITEM`), DS `Icon`, `Tooltip`, `Divider`, `Stack`, `GlassSurface`; `next/link`
- i18n: **no catalog edits in this task** (Task 7 owns all catalog work). This task references only existing keys: `nav.{companies,projects,agents,skills,commands,mcp,memory}` and `nav.settings` (already shipped as "System settings" / "Nastavení systému" — reuse verbatim, do not re-add or reword). The new `chat.toolDock.label` key lands in Task 7; until then it renders as its key path in tests, which assert hrefs, not copy.

**Interfaces:**
- Consumes (Task 2): `GlassSurface`.
- Consumes existing: `NAV_ITEMS: { id: string; glyph: IconName; href: string }[]`, `SETTINGS_ITEM` (same shape), `t("nav.<id>")`.
- Produces (Task 6):
```ts
export enum ChatToolDockTestId {
  Root = "chat-tool-dock",
  Settings = "chat-tool-dock-settings",
}
// each nav link: data-testid={`chat-tool-dock-${id}`}
export const CHAT_TOOL_DOCK_WIDTH = 70; // px the map's right inset must clear
```

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../test/renderWithProviders";
import { ChatToolDock, ChatToolDockTestId } from "./ChatToolDock";

describe("ChatToolDock", () => {
  it("links each tool to its HUD route, companies to /companies", () => {
    const { getByTestId } = renderWithProviders(<ChatToolDock />);
    expect(getByTestId(ChatToolDockTestId.Root)).toBeInTheDocument();
    expect(getByTestId("chat-tool-dock-companies")).toHaveAttribute("href", "/companies");
    expect(getByTestId("chat-tool-dock-agents")).toHaveAttribute("href", "/agents");
    expect(getByTestId(ChatToolDockTestId.Settings)).toHaveAttribute("href", "/settings");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `rtk vitest run apps/web/features/chat/components/ChatToolDock.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ChatToolDock`**

```tsx
"use client";

import { Divider, GlassSurface, Icon, Stack, Tooltip } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { NAV_ITEMS, SETTINGS_ITEM } from "../../../state/config";

export enum ChatToolDockTestId {
  Root = "chat-tool-dock",
  Settings = "chat-tool-dock-settings",
}

export const CHAT_TOOL_DOCK_WIDTH = 70;

// The design's tool set, in order — a subset of the HUD nav (source of truth).
const DOCK_IDS = ["companies", "projects", "agents", "skills", "commands", "mcp", "memory"] as const;

export function ChatToolDock() {
  const t = useTranslations("nav");
  const items = DOCK_IDS.map((id) => NAV_ITEMS.find((n) => n.id === id)).filter(
    (n): n is (typeof NAV_ITEMS)[number] => n != null,
  );

  return (
    <GlassSurface radius="panel" data-testid={ChatToolDockTestId.Root}>
      <Stack align="center" direction="column" gap="75">
        {items.map((item) => (
          <Tooltip key={item.id} content={t(item.id)}>
            <Link
              aria-label={t(item.id)}
              data-testid={`chat-tool-dock-${item.id}`}
              href={item.href}
            >
              <Icon name={item.glyph} />
            </Link>
          </Tooltip>
        ))}
        <Divider />
        <Tooltip content={t("settings")}>
          <Link
            aria-label={t("settings")}
            data-testid={ChatToolDockTestId.Settings}
            href={SETTINGS_ITEM.href}
          >
            <Icon name={SETTINGS_ITEM.glyph} />
          </Link>
        </Tooltip>
      </Stack>
    </GlassSurface>
  );
}
```
The DS `Tooltip` API is `{ content, children, side? }` with `TooltipSide = "top" | "bottom"` — there is **no left-side placement**; use the default `top` (extending `TooltipSide` is out of scope). A tooltip is a *description*, not a *name*, so each icon-only `Link` carries an explicit `aria-label` (shown above) — that is what makes it accessible, tooltip or not. Positioning of the dock (right:24, vertical-center) is applied by the mounting `Container` in Task 6 — the dock itself stays position-agnostic.

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk vitest run apps/web/features/chat/components/ChatToolDock.test.tsx`
Expected: PASS. (Labels resolve from the existing `nav.*` keys; no catalog edit happens in this task.)

- [ ] **Step 5: Gates**

Run: `rtk pnpm check:lint && rtk pnpm check:types && pnpm exec tsc -p apps/web --noEmit && rtk vitest run apps/web/features/chat/components/ChatToolDock.test.tsx`
Expected: clean + PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/web && rtk git commit -m "feat(chat): right-side glass tool dock linking HUD pages"
```

---

### Task 5: Left task list — floating glass cards

**Files:**
- Modify: `apps/web/features/chat/components/ChatTaskRow.tsx` (card anatomy)
- Modify: `apps/web/features/chat/components/ChatTaskRow.test.tsx`
- Modify: `apps/web/features/chat/components/ChatTasksPanel.tsx` (header)
- Modify: `apps/web/features/chat/components/ChatTasksPanel.test.tsx`
- Reuse (no change): `apps/web/features/runs/run.ts` (`runStateTone`, `runTitle`, `RunView`), DS `Card` (its built-in `edge?: StateTone` prop renders the 3px state-tinted left bar), `Progress`, `StatusDot`, `Icon`, `IconTile`, `Typography`, `RunStateBadge`
- i18n: **no catalog edits in this task** (Task 7 owns all catalog work — including the `chat.tasks.title` copy change to "Running tasks"/"Běžící úlohy"; the key itself already exists, so the header renders today's copy until Task 7)

**Interfaces:**
- Consumes: `runStateTone(status): StateTone | undefined` (**always default: `?? "accent"`**), `runTitle(run): string`, `RunView`, `Card` `edge?: StateTone`.
- Produces:
```ts
export enum ChatTaskRowTestId {
  Row = "chat-task-row",       // unchanged (test continuity)
  Meta = "chat-task-row-meta",
  Progress = "chat-task-row-progress",
}
// No Rail testid: the rail is Card's own `edge` rendering, not a node this component owns.
```
- `ChatTasksPanelTestId` unchanged (`Root/List/Empty`).

- [ ] **Step 1: Extend the failing `ChatTaskRow` test**

The existing test file already has a complete-fixture builder — reuse it (do not hand-roll partial casts):
```tsx
// Already at the top of ChatTaskRow.test.tsx:
function run(overrides: Partial<RunView>): RunView {
  const base: RunView = {
    runId: "r_1", kind: "agent", owner: "writer", status: "running", pct: null,
    title: "", prompt: "", project: "", startedAt: new Date().toISOString(), logBase: "agents",
  };
  return { ...base, ...overrides };
}
```
Add assertions for the new anatomy (keep the existing selection/title/accessible-name tests):
```tsx
it("shows the meta row always and a progress meter only when the run carries pct", () => {
  const { rerender } = render(
    <ChatTaskRow
      glyph="bot"
      onSelect={vi.fn()}
      openAria="Open run: Fix login bug"
      run={run({ runId: "run_a", title: "Fix login bug", pct: 74 })}
      selected={false}
      stateLabel="Running"
    />,
  );
  expect(screen.getByTestId(ChatTaskRowTestId.Meta)).toBeInTheDocument();
  expect(screen.getByTestId(ChatTaskRowTestId.Progress)).toHaveTextContent("74%");

  rerender(
    <ChatTaskRow
      glyph="bot"
      onSelect={vi.fn()}
      openAria="Open run: Fix login bug"
      run={run({ runId: "run_a", title: "Fix login bug", pct: null })}
      selected={false}
      stateLabel="Running"
    />,
  );
  expect(screen.queryByTestId(ChatTaskRowTestId.Progress)).toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `rtk vitest run apps/web/features/chat/components/ChatTaskRow.test.tsx`
Expected: FAIL — `Meta`/`Progress` testids absent.

- [ ] **Step 3: Rebuild `ChatTaskRow` to the card anatomy**

Keep `Card as="button"` + selection (accent border/ring, `onSelect(run.runId)`). Compute `const tone = runStateTone(run.status) ?? "accent";` (`runStateTone` returns `StateTone | undefined` — the default is mandatory). Layout, all via DS props (no raw inline style, no hex plumbing):
- Rail: `<Card as="button" edge={tone} …>` — `Card` ships exactly this feature ("a solid 3px accent bar on the left edge, tinted by state"); no bespoke rail node.
- Meta row (`data-testid={ChatTaskRowTestId.Meta}`): `StatusDot tone={tone}` + owner name (`Typography mono` with `tone={tone}`) + `RunStateBadge` + right-aligned relative start (`Intl.RelativeTimeFormat` or existing helper).
- Title: `runTitle(run)`, single-line ellipsis.
- Agent·phase row: `Icon name={live ? "pulse" : "run"}` + `"{owner} · {phase}"`.
- Meter (`data-testid={ChatTaskRowTestId.Progress}`): render `<Progress tone={tone} value={pct} />` + `mono {pct}%` **only when `run.pct != null`**.
- Hover/live: `Card` `tone={tone}` + `living` on genuinely in-flight runs (glow on top of the matte edge bar), per Card's own docs.
Keep the `avatar`/`glyph` `IconTile` if the card design keeps an avatar; otherwise the tone dot replaces it — match the spec's meta row. The prototype's decorative float animation is dropped (spec §5.4) — do not add keyframes.

- [ ] **Step 4: Run `ChatTaskRow` test to verify pass**

Run: `rtk vitest run apps/web/features/chat/components/ChatTaskRow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Update `ChatTasksPanel` header + test**

Replace the `HudPanel title="Tasks"` label with a header row: pulsing `StatusDot tone="run"` + `Typography type="label"` `t("tasks.title")` + right-aligned count (`runs.length`, `mono`, `variant="secondary"`). Add a test asserting the header shows the localized title and the count. Keep `Root/List/Empty` testids and the `hidden lg:` gutter.

- [ ] **Step 6: Run panel test to verify pass**

Run: `rtk vitest run apps/web/features/chat/components/ChatTasksPanel.test.tsx`
Expected: PASS. (The header keeps using the existing `chat.tasks.title` key; its copy change to "Running tasks"/"Běžící úlohy" lands in Task 7 — assert via the testid/key, not hardcoded copy.)

- [ ] **Step 7: Gates**

Run: `rtk pnpm check:lint && rtk pnpm check:types && pnpm exec tsc -p apps/web --noEmit && rtk vitest run apps/web/features/chat/components/ChatTaskRow.test.tsx apps/web/features/chat/components/ChatTasksPanel.test.tsx`
Expected: clean + PASS.

- [ ] **Step 8: Commit**

```bash
rtk git add apps/web && rtk git commit -m "feat(chat): floating task cards + running-tasks header"
```

---

### Task 6: `ChatScreen` integration + relocate New-chat/Voice + insets

**Files:**
- Modify: `apps/web/features/chat/components/ChatScreen.tsx` (replace inline top bar; mount dock; relocate controls; update insets; remove the `onClose` chain)
- Modify: `apps/web/features/chat/Screen.tsx` (drop the `onClose={close}` wiring)
- Modify: `apps/web/features/chat/components/ChatScreen.test.tsx`
- Reuse: `ChatTopBar`, `ChatToolDock` (+ `CHAT_TOOL_DOCK_WIDTH`), existing `VoiceToggleButton`, `VoiceStatusStrip`, `CommandLine`, `SubsystemOrbMap`

**Interfaces:**
- Consumes (Tasks 3, 4): `ChatTopBar`, `ChatTopBarProps`, `ChatToolDock`, `CHAT_TOOL_DOCK_WIDTH`, `ChatToolDockTestId`.

- [ ] **Step 1: Write the failing integration test**

```tsx
it("mounts the glass top bar and tool dock, and hosts new-chat + voice in the composer", () => {
  const { getByTestId, queryByTestId } = renderChatScreen({ messages: [/* one message */] });
  expect(getByTestId("chat-top-bar")).toBeInTheDocument();
  expect(getByTestId("chat-tool-dock")).toBeInTheDocument();
  // Close gone; new-chat present (relocated) when there are messages.
  expect(queryByTestId("chat-screen-close")).toBeNull();
  expect(getByTestId("chat-screen-new-chat")).toBeInTheDocument();
});
```
(Adapt `renderChatScreen` to the file's existing test harness.)

- [ ] **Step 2: Run it to verify it fails**

Run: `rtk vitest run apps/web/features/chat/components/ChatScreen.test.tsx`
Expected: FAIL — top-bar/dock testids absent; close still present.

- [ ] **Step 3: Replace the inline top bar with `<ChatTopBar mode={mode} onOpenPalette={openPalette} />` and remove the `onClose` chain end-to-end**

Delete the inline top-bar JSX (old lines ~485–539) including the Close button and the in-bar New-chat/Voice controls. Wire `mode` and the palette-open handler that already exists. The Close removal must take the **whole prop chain** with it, or lint fails on unused vars:
- `ChatScreen.tsx`: remove `onClose: () => void` from `ChatScreenProps` (~line 110) and `onClose` from the destructure (~line 135); remove the `Close = "chat-screen-close"` member from `ChatScreenTestId`.
- `Screen.tsx`: remove the `onClose={close}` prop (~line 55) and delete the `close` handler if nothing else uses it.

- [ ] **Step 4: Mount `ChatToolDock`**

Add an absolutely-positioned `Container` island (right-edge, vertical-center, `pointer-events-auto`, `zIndex` above the map) wrapping `<ChatToolDock />` — positioning via `Container` props (`position="absolute"`, `right`, `top`), not inline style on a div.

- [ ] **Step 5: Relocate New-chat + Voice into the composer**

In the composer block (border-top region with `VoiceStatusStrip` + `CommandLine`): render the `VoiceToggleButton` (when `voice.supported`) beside `VoiceStatusStrip`, and a small circular trash-icon button (`Icon name="trash"`, `aria`/`title` `t("newChat")`, `onClick={onNewChat}`, `data-testid="chat-screen-new-chat"`) rendered only when `messages.length > 0`.

- [ ] **Step 6: Update the orb-map right inset**

Change `SubsystemOrbMap` `insets` from `{ left: 300, right: 0, bottom: 230 }` to `{ left: 300, right: CHAT_TOOL_DOCK_WIDTH, bottom: 230 }` (import the constant from `ChatToolDock`).

- [ ] **Step 7: Run integration test to verify pass**

Run: `rtk vitest run apps/web/features/chat/components/ChatScreen.test.tsx`
Expected: PASS.

- [ ] **Step 8: Gates**

Run: `rtk pnpm check:lint && rtk pnpm check:types && pnpm exec tsc -p apps/web --noEmit && rtk vitest run apps/web/features/chat`
Expected: clean + PASS.

- [ ] **Step 9: Commit**

```bash
rtk git add apps/web && rtk git commit -m "feat(chat): wire glass chrome; relocate new-chat + voice to composer"
```

---

### Task 7: i18n catalog completion + cs/en parity

**Files:**
- Modify: `apps/web/i18n/messages/cs.json`, `apps/web/i18n/messages/en.json`
- Create/modify: `apps/web/i18n/messages/parity.test.ts` (or extend an existing catalog test)

**Interfaces:** none produced; guards copy completeness.

**This is the ONLY task that edits the catalogs** (Tasks 3/4/5 run in parallel and must not
touch these two files). The full change set: add `chat.toolDock.label`; update
`chat.tasks.title` copy; confirm `chat.statusPill.nominal`; **remove** `chat.close`
(the Close button is gone — Task 6). Existing keys `topbar.langSwitcherLabel` and
`nav.settings` are reused as-is — do not re-add, duplicate, or reword them.

- [ ] **Step 1: Write the failing parity test**

```ts
import { describe, expect, it } from "vitest";
import cs from "./cs.json";
import en from "./en.json";

function keys(o: Record<string, unknown>, p = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`],
  );
}

describe("i18n catalog parity", () => {
  it("cs and en have identical key sets", () => {
    expect(new Set(keys(cs))).toEqual(new Set(keys(en)));
  });
  it("has the phase-2 chrome keys (new + reused)", () => {
    for (const key of [
      "chat.toolDock.label",      // new this phase
      "chat.tasks.title",         // existing, copy updated
      "chat.statusPill.nominal",  // existing, copy confirmed
      "topbar.langSwitcherLabel", // existing, reused by LangSwitch
      "nav.settings",             // existing, reused by the tool dock
    ]) {
      expect(keys(en)).toContain(key);
      expect(keys(cs)).toContain(key);
    }
  });
  it("dropped the removed Close-button key", () => {
    expect(keys(en)).not.toContain("chat.close");
    expect(keys(cs)).not.toContain("chat.close");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `rtk vitest run apps/web/i18n/messages/parity.test.ts`
Expected: FAIL if any key is one-sided or missing.

- [ ] **Step 3: Complete both catalogs**

In **both** files, per the spec §7 table:
- Add `chat.toolDock.label` → `Nástroje` (cs) / `Tools` (en).
- Update `chat.tasks.title` copy → `Běžící úlohy` (cs, was `Tasky`) / `Running tasks` (en, was `Tasks`).
- Confirm `chat.statusPill.nominal` → `Nominální` (cs) / `Nominal` (en); repair if it drifted.
- **Remove** `chat.close` from both (the Close button and its prop chain were deleted in Task 6).
- Do **not** touch `topbar.langSwitcherLabel` or `nav.settings` — reused verbatim.
Fix any other drift the parity test surfaces.

- [ ] **Step 4: Run parity test to verify pass**

Run: `rtk vitest run apps/web/i18n/messages/parity.test.ts`
Expected: PASS.

- [ ] **Step 5: Gates**

Run: `rtk pnpm check:lint && rtk pnpm check:types && pnpm exec tsc -p apps/web --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/web && rtk git commit -m "chore(i18n): complete cs/en catalogs for immersive chrome"
```

---

### Task 8: Final gates + Storybook smoke + live `:3000` verify (PARK)

**Files:** none (verification only; a follow-up fix commit if a live defect is found).

- [ ] **Step 1: Full lint**

Run: `rtk pnpm check:lint`
Expected: clean.

- [ ] **Step 2: Full typecheck (both configs)**

Run: `rtk pnpm check:types && pnpm exec tsc -p apps/web --noEmit`
Expected: clean.

- [ ] **Step 3: Full test suite**

Run: `pnpm test`
Expected: green (ignore only the documented pre-existing flaky specs — `apps/api` pipelines e2e, memory-graph/pipeline-run Playwright — none of which this feature touches).

- [ ] **Step 4: Storybook smoke**

Run: `rtk pnpm build-storybook` (or `pnpm storybook` and load `Immersive/GlassSurface`).
Expected: builds; the `GlassSurface` story renders on the scene background.

- [ ] **Step 5: Live `:3000` verification (mandatory — jsdom cannot catch this)**

Ensure the dev server runs (`pnpm web:dev`; do not kill an already-running one). In a real browser load `http://localhost:3000/chat` and confirm every item in the spec's live-verification checklist:
- glass pills are actually translucent (backdrop blur visible over the moving scene, not opaque) — this also proves `--gradient-glass`/`--blur-glass` reach the DOM (runtime injection via `tokensToCssVars` is the primary path; the `@theme` declaration is the SSR default);
- the `LimitsRings` glass pill does not read as a nested double surface (its trigger is `Pressable`+`Container`, no own `Card`; if it looks nested anyway, drop the glass wrap — the popover keeps its `Card`);
- the tool dock is clickable — each icon navigates to its HUD route (Companies → `/companies` loads);
- the status pill shows counts and has **no** hover flyout;
- the language switch flips the UI copy (cs ⇄ en) and persists on reload;
- task cards hover-lift and the hue rail is coloured; a card click opens the detail column;
- New-chat (trash) and Voice toggle live in the composer, not the top bar; no Close button anywhere.
Capture one screenshot after first paint. (Avoid the `.playwright-mcp/` Fast-Refresh trap — screenshot once the page is loaded.)

- [ ] **Step 6: Fix any live defect, re-run the relevant gate, commit**

If the live pass surfaces a defect (a `"use client"` gap, `pointer-events` blocking clicks, a CSS-liveness miss — the class of bug jsdom cannot see), fix it, re-run the affected gate, and commit:
```bash
rtk git add apps/web libs && rtk git commit -m "fix(chat): live-verify corrections for immersive chrome"
```

- [ ] **Step 7: PARK at the PR gate**

Do **not** push and do **not** open a PR. Update `.superpowers/sdd2/progress.md` task log noting completion + park, and report the final commit hash to the operator. The operator reviews and merges.

---

## Self-Review

**1. Spec coverage** — Tokens (§4, incl. the `tokens.ts` `Theme` interface + `tokensToCssVars` + `lightTheme.ts` end-to-end story) → Task 1. GlassSurface primitive (§5.1, `"use client"`, no `ensureImmersiveCss` — no keyframes) → Task 2. Top panel with all components incl. counts-only pill, restyled search (real `SearchBar` API: `ariaLabel`+`shortcut`), reused LimitsRings, LangSwitch on `topbar.langSwitcherLabel` with the empty-value guard (§5.2) → Task 3. Close removal incl. the full `onClose` prop chain (§5.2) → Task 6. Right tool dock linking HUD incl. verified `/companies`, `Tooltip content` + default `top` side (no left in `TooltipSide`), explicit `aria-label` per link, existing `nav.settings` reused (§5.3) → Task 4. Left floating cards via `Card edge={tone}` with the `?? "accent"` default + header (§5.4, float animation dropped) → Task 5. Relocated New-chat + Voice (§5.5) → Task 6. Data sources (§6) reused, not invented, throughout. i18n (§7) → ALL catalog edits in Task 7 only (Tasks 3/4/5 reference existing keys), parity + `chat.close` removal guarded by test. Acceptance criteria incl. live `:3000` + LimitsRings double-surface check (§8) → Task 8. No spec section is unassigned.

**2. Placeholder scan** — No "TBD"/"add error handling"/"similar to Task N". Every code step shows code; every test step shows the assertion and the run command with expected output. Task 5's fixture reuses the test file's existing complete `run(overrides)` builder (shown verbatim) — no partial casts, no Czech literals in source. Where a DS prop signature still needs confirming (`StatusDot`/`Typography`/`MODE_DOT` in Task 3), the step says so explicitly; the previously guessed signatures (`SearchBar`, `Tooltip`, `Card edge`, `ButtonGroup`) are now written against the verified real APIs.

**3. Type consistency** — `GlassSurfaceProps.radius` = `"control"|"panel"|"pill"` used consistently in Tasks 2–5. The four `Theme` keys (`gradientGlass`, `colorGlassBorder`, `shadowGlass`, `blurGlass`) are declared in Task 1's interface step and consumed by name in Task 2's CSS vars. `ChatTopBarProps { mode, onOpenPalette }` produced in Task 3, consumed in Task 6. `CHAT_TOOL_DOCK_WIDTH` produced in Task 4, consumed in Task 6's inset change. `runStateTone(status): StateTone | undefined` is stated identically in the Global Constraints, Task 5's Interfaces block, and Task 5's implementation (`?? "accent"`). `ChatTaskRowTestId` has no `Rail` member anywhere (rail = `Card edge`). TestId enum values are unique and stable (`chat-task-row` kept for continuity). i18n keys referenced in Tasks 3–5 (`topbar.langSwitcherLabel`, `nav.*`, `chat.tasks.title`, `chat.toolDock.label`) match exactly the set Task 7 lands/asserts.
