# /chat Top Bar 1:1 Alignment Implementation Plan (Velín-D phase 3b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/chat` top bar match the Velín-D design 1:1 — exactly five glass elements (status · search · limits · HUD-switch · language), every one rendering through a single transparent `GlassSurface`, with the mode sign and clock removed.

**Architecture:** Two additive DS changes (a transparent `SearchBar` surface + a compact single-select `Dropdown` trigger) unblock two app fixes (searchbox renders through the glass; the language switch becomes the design's code-only dropdown and sheds its double-glass wrapper). `ChatTopBar` is restructured to the five-element set with a 56px header, a new 40×40 HUD link to `/overview`, and the mode/clock removed. `StatusPill` loses its redundant inner border. Reuse `LimitsRings` unchanged. Everything else (the status flyout, the search modal) is untouched.

**Tech Stack:** Next.js 15 App Router, React 19 (ref-as-prop, no `forwardRef`), TypeScript strict, Tailwind v4, `@zibby/design-system`, TanStack Query, next-intl, Vitest, pnpm + rtk.

**Spec:** `docs/superpowers/specs/2026-07-14-topbar-alignment-design.md` (authority for every contract). Design extraction: `.superpowers/sdd3/design-topbar.md`. Current-code intel: `.superpowers/sdd3/current-topbar.md`. Ledger: `.superpowers/sdd3/progress.md`.

## Global Constraints

- **Executes AFTER phase 3a** (`docs/superpowers/plans/2026-07-14-status-flyout.md`) on the same branch `feat/status-flyout`. Assume 3a's end state: `StatusPill` segments are `<button>` triggers, the pill root has `id="chat-status-pill-root"` and `className="rounded-full border border-border px-[14px] py-[6px]"`, `StatusFlyoutPanel`/`useStatusFlyout`/`statusFlyout.ts`/`FlyoutWorkRow`/`FlyoutApprovalRow` and the `chat.statusPill.flyout.*` keys exist. **Do NOT touch, re-do, or conflict with any 3a work** — the only 3b edit to `StatusPill.tsx` is removing its inner border (Task 6).
- **Transparency is the #1 concern.** Every bar element renders through exactly ONE `GlassSurface`, nothing opaque inside it, no doubled glass/blur. The DS glass tokens already byte-match the design recipe — do NOT re-implement glass CSS.
- **The shared glass recipe (verbatim, `design-topbar.md` §1 — already the live DS tokens, do not change):**
  - `--gradient-glass: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02) 40%, rgba(16,21,28,0.5))`
  - `--blur-glass: blur(22px) saturate(180%)`
  - `--color-glass-border: rgba(255,255,255,0.12)`
  - `--shadow-glass: inset 0 1px 0 rgba(255,255,255,0.13), 0 16px 40px rgba(0,0,0,0.42)`
- **Design geometry (verbatim, `design-topbar.md` §4):** bar height **56px**, padding `0 22px`; all bar elements radius **999** (pill); inter-element gap **10px**; status pill 411×40; searchbox **190×40** (icon 13px, placeholder `Hledat…` 12.5px, `⌘K` chip mono 9px bordered); limits 119×41 (rings 30×30); HUD switch **40×40** circle (`grid` glyph 13px, colour `#9aa7b4`); lang trigger auto×40 (code-only `CZ`/`EN` accent `#5b8def`, chevron rotate, accent border on open).
- **Design→token reconciliations (accepted micro-deviations, spec §11):** gap 10px → `gap="150"` (12px, nearest token; no 10px token exists); element heights content-driven (~40px) with `align="center"` — only widths are hard-set (search 190, HUD 40); colours `ink2 #9aa7b4`→`text-foreground-dim`, `ink3 #66737f`→`text-foreground-faint`, `accent #5b8def`→`text-accent`.
- **DS changes are ADDITIVE** — `SearchBar.surface` defaults `"solid"`, `Dropdown.compact` (single) defaults off; every existing consumer is byte-identical. No base mutation, no barrel-signature break.
- **Limits reused UNCHANGED** — do not restyle `LimitsRings` or its popover (spec §6.4 documented deviation: the app-wide solid-popover convention wins; the mandate concerns the five triggers, and the limits trigger is already glass).
- **English-only identifiers/comments** (incl. test fixtures). Every user-visible string via next-intl. Language endonyms `Čeština`/`English` stay inline data (read the same in every locale, per the design), not catalog keys.
- **i18n catalog edits land ONLY in Task 7** (parallel-conflict law). Tasks 1–6 must not touch `cs.json`/`en.json`. The new `chat.hudSwitchLabel` renders as its key path in component tests until Task 7 (next-intl missing-key fallback) — tests assert testids/attributes, never the copy.
- **Repo laws:** pnpm + `rtk` prefix (even in `&&` chains) — EXCEPT vitest, which must NOT go through rtk (`pnpm exec vitest run …`); React 19 no `forwardRef`; no `any`; TestId enums + `getByTestId` (roles/ARIA as assertions only); no inline `style={{}}` on a raw DOM node in `apps/web` — dynamic values ride a DS component's `style` passthrough (`GlassSurface`/`Stack`/`Container` all pass `style` through); never `--no-verify`; don't kill the `:3000` dev server; don't commit `.zibby/data/system-config.json`.
- **Test commands:**
  - DS (libs) tests — from repo root: `pnpm exec vitest run libs/design-system/src/components/<C>/<C>.test.tsx --reporter=basic`
  - apps/web component tests — `cd apps/web && pnpm exec vitest run --config vitest.components.config.ts <path-relative-to-apps/web> --reporter=basic`
  - i18n parity — from repo root: `pnpm exec vitest run apps/web/i18n/messages/parity.test.ts --reporter=basic`
- **Gates after any codegen, in order:** `rtk pnpm check:lint` → `rtk pnpm check:types` **and** `pnpm exec tsc -p apps/web --noEmit` (base config misses `apps/web`) → the task's tests. Fix all before moving on.
- **PARK at the PR gate:** commit on `feat/status-flyout`; never push, never open a PR without explicit operator instruction. The self-knowledge pre-commit hook may abort a commit and leave files staged → run `pnpm self-knowledge:generate`, verify the staged set (`rtk git status`), retry. Never `--no-verify`.

---

## Task sequencing & parallelism

| # | Task | Depends on | Wave |
|---|---|---|---|
| 1 | DS `SearchBar` transparent surface | — | **Wave A — parallel, NO commit** |
| 2 | DS `Dropdown` compact single trigger | — | **Wave A — parallel, NO commit** |
| 3 | `LangSwitch` → compact `Dropdown` (commits Wave A first) | 1, 2 | sequential (commits) |
| 4 | Remove mode group + clock (reversible) | — | sequential (commits) |
| 5 | `ChatTopBar` restructure — transparent search + HUD switch + 56px header | 1, 3, 4 | sequential (commits) |
| 6 | `StatusPill` inner-border removal | (3a only) | sequential (commits) |
| 7 | i18n catalogs + parity (ONLY catalog task) | 5 | sequential (commits) |
| 8 | Final gates + live `:3000` verify (PARK) | all | sequential |

- **Wave A = Tasks 1 + 2** — disjoint DS component dirs (`SearchBar/**` vs `Dropdown/**`), no i18n, both additive. Run in parallel as a **no-commit** wave; Task 3 Step 0 commits both in one commit (avoids two workers committing concurrently on one branch).
- **Tasks 4 and 6 are also disjoint** (`ChatTopBar.tsx`+`ChatScreen.tsx` vs `StatusPill.tsx`, no i18n) and MAY be parallelized as a second no-commit wave if the executor wishes; the default below keeps them sequential with their own commits for simplicity.

---

### Task 1: DS `SearchBar` transparent surface (Wave A — parallel with Task 2, NO commit)

**Files:**
- Modify: `libs/design-system/src/components/SearchBar/SearchBar.tsx`
- Modify: `libs/design-system/src/components/SearchBar/SearchBar.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `SearchBarProps.surface?: "solid" | "transparent"` (default `"solid"`). `surface="transparent"` drops `bg-background border-border` for `bg-transparent border-transparent`. `SearchBarTestId` unchanged.

- [ ] **Step 1: Add the failing tests**

Add these two `it` blocks inside the existing `describe("SearchBar", …)` in `SearchBar.test.tsx`:
```tsx
  it("keeps an opaque fill by default", () => {
    render(<SearchBar ariaLabel="Command" placeholder="Command…" />);
    expect(screen.getByTestId(SearchBarTestId.Root)).toHaveClass("bg-background");
  });

  it("drops the opaque fill in the transparent surface so glass shows through", () => {
    render(<SearchBar ariaLabel="Command" placeholder="Command…" surface="transparent" />);
    const root = screen.getByTestId(SearchBarTestId.Root);
    expect(root).toHaveClass("bg-transparent");
    expect(root).not.toHaveClass("bg-background");
  });
```
(`render`, `screen`, `SearchBar`, `SearchBarTestId` are already imported in this file.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run libs/design-system/src/components/SearchBar/SearchBar.test.tsx --reporter=basic`
Expected: FAIL — the second test errors (unknown `surface` prop / still `bg-background`).

- [ ] **Step 3: Implement — replace the whole file body**

`libs/design-system/src/components/SearchBar/SearchBar.tsx`:
```tsx
import type { Ref } from "react";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";
import { Icon } from "../Icon/Icon";
import { Kbd } from "../Kbd/Kbd";

export enum SearchBarTestId {
  Root = "searchbar-root",
  Icon = "searchbar-icon",
  Placeholder = "searchbar-placeholder",
  Shortcut = "searchbar-shortcut",
}

export interface SearchBarProps {
  /** Prompt text shown inside the bar (acts as placeholder). */
  placeholder: string;
  /** Accessible label — the bar is a button that opens a command palette. */
  ariaLabel: string;
  /** Optional keyboard-shortcut hint rendered as a `<kbd>` on the trailing edge. */
  shortcut?: string;
  /** Native tooltip text. */
  title?: string;
  onClick?: () => void;
  ref?: Ref<HTMLButtonElement>;
  /** Chrome fill. "solid" (default) keeps the opaque input look; "transparent"
   * drops the own background + border so a surrounding GlassSurface shows through. */
  surface?: "solid" | "transparent";
}

/**
 * The dashboard command / search bar. A wide, quiet button styled like an input
 * that opens the command palette on click (or via its keyboard shortcut). Sizing
 * is fluid — it fills its container, so callers control the width via layout.
 * `surface="transparent"` lets it sit inside a glass pill without an opaque fill.
 */
export function SearchBar({
  placeholder,
  ariaLabel,
  shortcut,
  title,
  onClick,
  ref,
  surface = "solid",
}: SearchBarProps) {
  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        "flex items-center gap-2.5 w-full px-3.5 py-2 cursor-pointer",
        surface === "transparent"
          ? "bg-transparent border border-transparent"
          : "bg-background border border-border",
        "rounded-sm text-foreground-faint",
        "transition-colors",
        "hover:border-border-strong hover:text-foreground-dim",
        focusRing,
      )}
      data-testid={SearchBarTestId.Root}
      onClick={onClick}
      ref={ref}
      title={title}
      type="button"
    >
      <Icon data-testid={SearchBarTestId.Icon} name="search" size="sm" />
      <span
        className="flex-1 min-w-0 text-left text-base truncate"
        data-testid={SearchBarTestId.Placeholder}
      >
        {placeholder}
      </span>
      {shortcut ? <Kbd data-testid={SearchBarTestId.Shortcut}>{shortcut}</Kbd> : null}
    </button>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm exec vitest run libs/design-system/src/components/SearchBar/SearchBar.test.tsx --reporter=basic`
Expected: PASS (all, including the two originals).

- [ ] **Step 5: Gates (NO commit — Wave A; Task 3 commits)**

Run: `rtk pnpm check:lint && rtk pnpm check:types && pnpm exec tsc -p apps/web --noEmit`
Expected: clean.

---

### Task 2: DS `Dropdown` compact single trigger (Wave A — parallel with Task 1, NO commit)

**Files:**
- Modify: `libs/design-system/src/components/Dropdown/Dropdown.tsx`
- Modify: `libs/design-system/src/components/Dropdown/Dropdown.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `DropdownSingleProps.compact?: boolean`. When `compact && !isField`, the single trigger renders only the option `code` (falls back to `label` when no code) + chevron — omitting the full-label span. Menu rows unchanged. `DropdownTestId` unchanged.

- [ ] **Step 1: Add the failing tests**

Add these two `it` blocks inside the existing `describe("Dropdown", …)` in `Dropdown.test.tsx` (`OPTIONS` = CZ/EN with codes, `render`/`screen`/`userEvent`/`vi`/`DropdownTestId` already imported):
```tsx
  it("compact single trigger shows only the code, not the label", () => {
    render(<Dropdown compact onChange={vi.fn()} options={OPTIONS} value="cs" />);
    const trigger = screen.getByTestId(DropdownTestId.Trigger);
    expect(trigger).toHaveTextContent("CZ");
    expect(trigger).not.toHaveTextContent("Čeština");
  });

  it("compact trigger still lists full labels in the open menu", async () => {
    render(<Dropdown compact onChange={vi.fn()} options={OPTIONS} value="cs" />);
    await userEvent.click(screen.getByTestId(DropdownTestId.Trigger));
    expect(screen.getByTestId(DropdownTestId.Panel)).toHaveTextContent("English");
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run libs/design-system/src/components/Dropdown/Dropdown.test.tsx --reporter=basic`
Expected: FAIL — the compact trigger still renders `Čeština`.

- [ ] **Step 3: Add `compact` to the single-props interface**

In `Dropdown.tsx`, replace the `DropdownSingleProps` interface:
```ts
export interface DropdownSingleProps<T extends string = string> extends DropdownBaseProps<T> {
  multi?: false;
  value: T;
  onChange: (value: T) => void;
}
```
with:
```ts
export interface DropdownSingleProps<T extends string = string> extends DropdownBaseProps<T> {
  multi?: false;
  value: T;
  onChange: (value: T) => void;
  /** Trigger shows only the option `code` (falls back to `label` when no code),
   * omitting the full label — for dense chrome like the top-bar language switch.
   * The menu rows are unaffected (full labels remain). */
  compact?: boolean;
}
```

- [ ] **Step 4: Derive `compactTrigger` and gate the trigger label span**

In `Dropdown.tsx`, immediately after the existing line
```ts
  const compact = props.multi === true && props.compact === true;
```
add:
```ts
  // Single-select trigger showing only the option code (top-bar language switch).
  // Distinct from the multi `compact` above (which controls chip overflow).
  const compactTrigger = props.multi !== true && props.compact === true;
```

Then, in the single-select `<button>` branch, replace the label span:
```tsx
                <span
                  className={cn(
                    isField
                      ? "flex-1 text-left text-md text-foreground"
                      : "text-foreground-dim font-normal text-caption",
                  )}
                >
                  {current?.label ?? props.value}
                </span>
```
with the guarded version (still shows a label when there is no code, so the trigger never renders blank):
```tsx
                {(!compactTrigger || current?.code === undefined) && (
                  <span
                    className={cn(
                      isField
                        ? "flex-1 text-left text-md text-foreground"
                        : "text-foreground-dim font-normal text-caption",
                    )}
                  >
                    {current?.label ?? props.value}
                  </span>
                )}
```
(The `code` span directly above it is unchanged — CZ/EN stays, coloured `text-accent`.)

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm exec vitest run libs/design-system/src/components/Dropdown/Dropdown.test.tsx --reporter=basic`
Expected: PASS (all, including the pre-existing single/multi tests).

- [ ] **Step 6: Gates (NO commit — Wave A; Task 3 commits)**

Run: `rtk pnpm check:lint && rtk pnpm check:types && pnpm exec tsc -p apps/web --noEmit`
Expected: clean.

---

### Task 3: `LangSwitch` → compact `Dropdown` (commits Wave A first)

**Files:**
- Modify: `apps/web/features/chat/components/LangSwitch.tsx`
- Modify: `apps/web/features/chat/components/LangSwitch.test.tsx`

**Interfaces:**
- Consumes: `Dropdown` (`variant="inline"`, `size="sm"`, `compact` — Task 2), `DropdownTestId.Trigger`.
- Produces: `LangSwitch` renders a single compact `Dropdown` (no wrapping `GlassSurface`). `LangSwitchTestId` is **removed** (unused anywhere — verified: only self-referenced). Cookie/refresh mechanics unchanged.

- [ ] **Step 0: Commit Wave A output (Tasks 1 + 2)**

```bash
rtk git add libs/design-system/src/components/SearchBar libs/design-system/src/components/Dropdown && rtk git commit -m "feat(design-system): SearchBar transparent surface + Dropdown compact single trigger"
```

- [ ] **Step 1: Replace the test file**

`apps/web/features/chat/components/LangSwitch.test.tsx`:
```tsx
import { DropdownTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { LangSwitch } from "./LangSwitch";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("LangSwitch", () => {
  it("shows only the current locale code in the compact trigger", () => {
    renderWithProviders(<LangSwitch />);
    const trigger = screen.getByTestId(DropdownTestId.Trigger);
    expect(trigger).toHaveTextContent("CZ");
    expect(trigger).not.toHaveTextContent("Čeština");
  });

  it("writes the locale cookie and refreshes when a language is picked", async () => {
    renderWithProviders(<LangSwitch />);
    await userEvent.click(screen.getByTestId(DropdownTestId.Trigger));
    await userEvent.click(screen.getByText("English"));
    expect(document.cookie).toContain("locale=en");
    expect(refresh).toHaveBeenCalled();
  });
});
```
(Default test locale is `cs`, so the trigger reads `CZ`. `screen` is re-exported from `../../../test/render`.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm exec vitest run --config vitest.components.config.ts features/chat/components/LangSwitch.test.tsx --reporter=basic`
Expected: FAIL — old `LangSwitch` renders a `ButtonGroup`, no `DropdownTestId.Trigger`.

- [ ] **Step 3: Replace the component**

`apps/web/features/chat/components/LangSwitch.tsx`:
```tsx
"use client";

import { Dropdown } from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

type Locale = "cs" | "en";

function isLocale(value: string): value is Locale {
  return value === "cs" || value === "en";
}

/** Module-scoped so the cookie write isn't analysed as an in-render mutation
 * (same pattern as features/settings/Screen.tsx). */
function writeLocaleCookie(value: Locale) {
  document.cookie = `locale=${value}; path=/; max-age=31536000`;
}

/**
 * Compact code-only language switch (Velín-D top bar): a DS `Dropdown` (inline,
 * size sm, compact — CZ/EN, accent border + chevron on open). No wrapping
 * GlassSurface — the top bar supplies the single glass layer (the phase-2 double
 * glass nesting is gone). Locale mechanics unchanged: cookie write + router.refresh()
 * so i18n/request.ts re-reads on the next render.
 */
export function LangSwitch() {
  const t = useTranslations("topbar");
  const locale = useLocale() as Locale;
  const router = useRouter();

  const setLocale = (value: string) => {
    if (!isLocale(value) || value === locale) return;
    writeLocaleCookie(value);
    router.refresh();
  };

  return (
    <Dropdown
      aria-label={t("langSwitcherLabel")}
      compact
      onChange={setLocale}
      options={[
        { value: "cs", code: "CZ", label: "Čeština" },
        { value: "en", code: "EN", label: "English" },
      ]}
      size="sm"
      value={locale}
      variant="inline"
    />
  );
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd apps/web && pnpm exec vitest run --config vitest.components.config.ts features/chat/components/LangSwitch.test.tsx --reporter=basic`
Expected: PASS.

- [ ] **Step 5: Gates**

Run: `rtk pnpm check:lint && rtk pnpm check:types && pnpm exec tsc -p apps/web --noEmit`
Expected: clean. (`check:lint` will confirm no dangling `LangSwitchTestId`/`ButtonGroup`/`GlassSurface` imports remain.)

- [ ] **Step 6: Commit**

```bash
rtk git add apps/web/features/chat/components/LangSwitch.tsx apps/web/features/chat/components/LangSwitch.test.tsx && rtk git commit -m "feat(chat): language switch is the design's compact code-only dropdown (single glass layer)"
```

---

### Task 4: Remove the mode group + clock from `ChatTopBar` (reversible)

**Files:**
- Modify: `apps/web/features/chat/components/ChatTopBar.tsx`
- Modify: `apps/web/features/chat/components/ChatTopBar.test.tsx`
- Modify: `apps/web/features/chat/components/ChatScreen.tsx` (drop the `mode` prop pass AND its entire now-orphaned derivation chain — see Step 4)
- Modify: `apps/web/features/chat/components/ChatScreen.test.tsx` (delete the mode-derivation suite — see Step 5)
- Delete: `apps/web/features/chat/chatMode.ts` (zero importers after this task — see Step 6)

**Interfaces:**
- Consumes: `StatusPill`, `SearchBar`, `LimitsRings`, `LangSwitch`, `GlassSurface`, `Stack`.
- Produces: `ChatTopBarProps` loses `mode`; `ChatTopBarTestId` loses `Mode`/`Clock`; `ChatScreenTestId` loses `ModeDot`; the `chatMode` module (`ChatMode`/`MODE_DOT`) is deleted. The bar renders four glass elements (status/search/limits/lang) — HUD + geometry arrive in Task 5. **This is the reversible removal task** (revert = revert this one commit).

> **Removal-scope ground truth (verified on disk; each link's ONLY consumer is the next):**
> `mode` (ChatScreen.tsx ~415-434) is consumed ONLY by `<ChatTopBar mode={mode}>`; `errorMode` (~412)
> and `waitingApproval` (~413) feed only `mode`; `WAITING_APPROVAL_STATUSES` (~57) feeds only
> `waitingApproval`; `lastRun` (~365) feeds only `waitingApproval`, so the
> `lastRunRef`/`findLastRunRef`/`usePipelineRunQuery` block (~355-365 + fn at ~61-75) is a mode-only
> feed (its own comment says so — removing it deliberately drops that polling subscription); `lastTool`
> (~353) feeds only the ternary; `hasDraft` (~349) is read only by the ternary (its setter is passed to
> the composer solely to drive it — `onDraftChange` is optional on `CommandLine`). Leaving ANY of these
> makes this commit fail lint (`no-unused-vars`). Line numbers are indicative — match by the quoted
> code, and re-verify with the Step 4 greps if the file has drifted.

- [ ] **Step 1: Replace the test file**

`apps/web/features/chat/components/ChatTopBar.test.tsx`:
```tsx
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { ChatTopBar, ChatTopBarTestId } from "./ChatTopBar";

describe("ChatTopBar", () => {
  it("renders the glass bar with the status, search, limits and lang elements", () => {
    renderWithProviders(<ChatTopBar onOpenPalette={vi.fn()} />);
    expect(screen.getByTestId(ChatTopBarTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(ChatTopBarTestId.Search)).toBeInTheDocument();
    expect(screen.getByTestId(ChatTopBarTestId.Lang)).toBeInTheDocument();
  });

  it("has no mode sign, mode dot or clock (removed for 1:1)", () => {
    renderWithProviders(<ChatTopBar onOpenPalette={vi.fn()} />);
    expect(screen.queryByTestId("chat-top-bar-mode")).toBeNull();
    expect(screen.queryByTestId("chat-screen-mode-dot")).toBeNull();
    expect(screen.queryByTestId("chat-top-bar-clock")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm exec vitest run --config vitest.components.config.ts features/chat/components/ChatTopBar.test.tsx --reporter=basic`
Expected: FAIL — the mode group + clock (and their testids) still render.

- [ ] **Step 3: Replace the component (mode group + clock removed)**

`apps/web/features/chat/components/ChatTopBar.tsx`:
```tsx
"use client";

import { GlassSurface, SearchBar, Stack } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { LimitsRings } from "../../../components/layout/LimitsRings/LimitsRings";
import { LangSwitch } from "./LangSwitch";
import { StatusPill } from "./StatusPill";

export enum ChatTopBarTestId {
  Root = "chat-top-bar",
  Search = "chat-top-bar-search",
  Lang = "chat-top-bar-lang",
}

export interface ChatTopBarProps {
  onOpenPalette: () => void;
}

/**
 * The Velín-D glass top bar: the live status pill, the ⌘K searchbox, the Claude
 * limits gauge and the language selector — each in its own single GlassSurface.
 * The mode sign and clock were removed (not in the design). The HUD switch and the
 * 56px header geometry arrive in the next task.
 */
export function ChatTopBar({ onOpenPalette }: ChatTopBarProps) {
  const t = useTranslations("chat");

  return (
    <Stack align="center" data-testid={ChatTopBarTestId.Root} direction="row" gap="150">
      <GlassSurface radius="pill">
        <StatusPill />
      </GlassSurface>

      <GlassSurface data-testid={ChatTopBarTestId.Search} radius="pill">
        <SearchBar
          ariaLabel={t("palette.placeholder")}
          onClick={onOpenPalette}
          placeholder={t("palette.placeholder")}
          shortcut="⌘K"
        />
      </GlassSurface>

      <GlassSurface radius="pill">
        <LimitsRings />
      </GlassSurface>

      <GlassSurface data-testid={ChatTopBarTestId.Lang} radius="pill">
        <LangSwitch />
      </GlassSurface>
    </Stack>
  );
}
```

- [ ] **Step 4: Drop the `mode` prop AND its whole orphaned derivation chain in `ChatScreen.tsx`**

All edits below are in `apps/web/features/chat/components/ChatScreen.tsx`. Match by the quoted code (line numbers are indicative).

**4a — the prop pass (~line 478):**
```tsx
        <ChatTopBar mode={mode} onOpenPalette={openPalette} />
```
→
```tsx
        <ChatTopBar onOpenPalette={openPalette} />
```

**4b — the mode ternary + its two feeders (~lines 412-434). Delete this whole block:**
```tsx
  const errorMode = stream.error !== null || sendMessage.isError;
  const waitingApproval = lastRun !== undefined && WAITING_APPROVAL_STATUSES.has(lastRun.status);

  const mode: ChatMode = errorMode
    ? "error"
    : waitingApproval
      ? "waiting-approval"
      : lastTool?.status === "started" && stream.streaming
        ? "tool"
        : stream.streaming && stream.text.length > 0
          ? "streaming"
          : sendMessage.isPending || stream.streaming
            ? "thinking"
            : // `speaking` (Phase 119b): the turn is done, its voice reply is
              // playing. Sits below the live-turn states (thinking/streaming/tool
              // still win while the turn is in flight) and above listening/idle.
              speakingReply
              ? "speaking"
              : // `listening` is driven by REAL mic state while voice mode is on
                // (Phase 119a); otherwise it falls back to the composer draft.
                (voice.active && voice.listening) || hasDraft
                ? "listening"
                : "idle";
```

**4c — the mode-only pipeline-run feed (~lines 355-365). Delete the comment + both statements** (this deliberately drops the `usePipelineRunQuery` polling subscription — it existed solely to feed the mode dot, per its own comment):
```tsx
  // The most recently dispatched run's id, across the in-flight turn and the
  // committed transcript (newest first) — always computed so the query below
  // stays an unconditional hook call (React rules). `usePipelineRunQuery` itself
  // no-ops on `null` (`enabled: pipelineRunId !== null`), and shares its cache
  // with `ChatRunCard` (Decision 5, Phase 15.3) — no new polling for a run
  // already rendered inline in the transcript.
  const lastRunRef = findLastRunRef([
    stream.toolEvents,
    ...[...messages].reverse().map((m) => m.toolEvents),
  ]);
  const { data: lastRun } = usePipelineRunQuery(lastRunRef);
```

**4d — `lastTool` (~line 353). Delete:**
```tsx
  const lastTool = stream.toolEvents[stream.toolEvents.length - 1];
```

**4e — the `hasDraft` state (~lines 346-349). Delete the comment + statement:**
```tsx
  // Composer activity is the only new state this phase adds — everything else the
  // orb needs is already carried by the stream + mutation (see Decision 1, Phase
  // 14.1 of the phase-14 plan).
  const [hasDraft, setHasDraft] = useState(false);
```
…and its setter pass on the composer (~line 685; `onDraftChange` is optional on `CommandLine`, so dropping the prop is safe). Delete this one line from the `<CommandLine …>` JSX:
```tsx
              onDraftChange={setHasDraft}
```

**4f — `WAITING_APPROVAL_STATUSES` (~lines 55-59). Delete the doc comment + const** (the comment ends `…parked after exhausting retries (\`parked\`). */`):
```tsx
const WAITING_APPROVAL_STATUSES = new Set(["awaiting-approval", "parked", "held"]);
```

**4g — `findLastRunRef` (~lines 61-75). Delete the whole function + its doc comment:**
```tsx
function findLastRunRef(toolEventLists: (ChatToolEvent[] | undefined)[]): string | null {
  for (const events of toolEventLists) {
    if (!events) continue;
    for (let i = events.length - 1; i >= 0; i--) {
      const runRef = events[i]?.runRef;
      if (runRef) return runRef;
    }
  }
  return null;
}
```

**4h — the dead `ChatScreenTestId.ModeDot` member (~lines 81-83). Delete the comment + member** (its only remaining reference is the test suite Step 5 deletes; a dead enum member has no consumer):
```tsx
  /** The header's derived-mode status dot (Task 13) — the surviving read-out of
   * the retired scene's `data-mode`, now a plain DS `StatusDot`. */
  ModeDot = "chat-screen-mode-dot",
```

**4i — imports. Three edits:**
- Delete line ~40: `import type { ChatMode } from "../chatMode";`
- Line ~27: `import { usePipelineRunQuery, usePipelinesQuery } from "../../pipelines";` → `import { usePipelinesQuery } from "../../pipelines";`
- Lines ~7-12: remove `ChatToolEvent,` from the `@zibby/contracts` type import (its only use was `findLastRunRef`'s signature), keeping `ChatMessage as ChatMessageType`, `SubsystemId`, `TaskTarget`.
Do NOT touch `useNow`/`MINUTE_MS` in ChatScreen — they are still used (~line 128).

**4j — verify nothing was missed:** run `rtk grep "errorMode\|waitingApproval\|lastRunRef\|findLastRunRef\|lastRun\b\|lastTool\|hasDraft\|WAITING_APPROVAL_STATUSES\|ChatMode\|ModeDot" apps/web/features/chat/components/ChatScreen.tsx` — expect ZERO matches. If any symbol survives, its consumer was added after this plan was written: STOP and reconcile (keep the symbol and its chain) rather than deleting a live consumer.

- [ ] **Step 5: Delete the mode-derivation suite in `ChatScreen.test.tsx`**

In `apps/web/features/chat/components/ChatScreen.test.tsx`:
- Delete the **entire** `describe("orb mode derivation (Phase 14.1)", () => { … });` block (~lines 325-428): its 7 tests and the shared `modeDot()` helper all render the mode dot Step 4 removed — every one would throw on `getByTestId(ChatScreenTestId.ModeDot)`. The block starts at:
```tsx
  describe("orb mode derivation (Phase 14.1)", () => {
```
and ends at the `});` immediately before `describe("subsystem orb map (Task 13, was the WebGL overlay in Phase 95)", …)`.
- Remove `StatusDotTestId,` from the `@zibby/design-system` import (~line 212) — its only use was the deleted `modeDot()` helper.
- **Leave the module-level `pipelineRunMock` plumbing** (the `vi.hoisted` block ~196-198, the `vi.mock("../../pipelines", …)` wiring ~201, and the `beforeEach` `mockReset`/`mockReturnValue` ~253-254): it mocks an export that still exists in `../../pipelines`, the reset calls count as uses (not lint-flagged), and other suites share the mock module. Only its in-suite use (`pipelineRunMock.mockReturnValue({ data: { status: "awaiting-approval" } })`, ~line 409) goes — it is inside the deleted describe.

- [ ] **Step 6: Delete the orphaned `chatMode.ts` module**

Verify first: run `rtk grep "chatMode\|MODE_DOT" apps/web --include="*.ts" --include="*.tsx"` (ignore `.next/` artifacts). Expected surviving matches: NONE that import — only `SubsystemDrawer.tsx`'s prose doc-comment mention of `MODE_DOT` (not an import — leave it) and `chatMode.ts` itself. If ANY real import survives, STOP and reconcile (keep the module). Otherwise:
```bash
rtk git rm apps/web/features/chat/chatMode.ts
```
(No `chatMode.test.ts` exists — verified.)

- [ ] **Step 7: Run tests to verify pass**

Run: `cd apps/web && pnpm exec vitest run --config vitest.components.config.ts features/chat --reporter=basic`
Expected: PASS (ChatTopBar's new tests + the surviving ChatScreen suites — the mode-derivation suite is gone).

- [ ] **Step 8: Gates**

Run: `rtk pnpm check:lint && rtk pnpm check:types && pnpm exec tsc -p apps/web --noEmit`
Expected: clean — this is the proof the orphan cascade is complete: any leftover `no-unused-vars` (e.g. `lastTool`, `hasDraft`, `WAITING_APPROVAL_STATUSES`) or unresolved `ChatMode` import fails here.

- [ ] **Step 9: Commit**

```bash
rtk git add apps/web/features/chat && rtk git commit -m "refactor(chat): remove top-bar mode sign + clock and the orphaned mode derivation (not in Velín-D design)"
```
(One commit on purpose — the removal stays reversible as a single revert. `rtk git add apps/web/features/chat` covers the two component files, both test files, and the `chatMode.ts` deletion.)

---

### Task 5: `ChatTopBar` restructure — transparent search + HUD switch + 56px header

**Files:**
- Modify: `apps/web/features/chat/components/ChatTopBar.tsx`
- Modify: `apps/web/features/chat/components/ChatTopBar.test.tsx`
- Modify: `apps/web/features/chat/components/ChatScreen.tsx` (bar-band wrapper vertical padding — line ~477)

**Interfaces:**
- Consumes: `SearchBar.surface="transparent"` (Task 1), `LangSwitch` (Task 3), `GlassSurface` `style` passthrough, `Stack` `as`/`style`, `Icon`, `next/link`, `t("hudSwitchLabel")` (key added Task 7).
- Produces: `ChatTopBarTestId.Hud = "chat-top-bar-hud"`; the five-element 1:1 bar (56px header, 190px transparent searchbox, 40×40 HUD link → `/overview`).

- [ ] **Step 1: Extend the test file**

Add these two `it` blocks inside the existing `describe("ChatTopBar", …)` (Task 4's file) and add `within` to the render import (`import { renderWithProviders, screen, within } from "../../../test/render";`):
```tsx
  it("renders the HUD switch and the language selector", () => {
    renderWithProviders(<ChatTopBar onOpenPalette={vi.fn()} />);
    expect(screen.getByTestId(ChatTopBarTestId.Hud)).toBeInTheDocument();
    expect(screen.getByTestId(ChatTopBarTestId.Lang)).toBeInTheDocument();
  });

  it("points the HUD switch at the overview route", () => {
    renderWithProviders(<ChatTopBar onOpenPalette={vi.fn()} />);
    const link = within(screen.getByTestId(ChatTopBarTestId.Hud)).getByRole("link");
    expect(link).toHaveAttribute("href", "/overview");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm exec vitest run --config vitest.components.config.ts features/chat/components/ChatTopBar.test.tsx --reporter=basic`
Expected: FAIL — no `Hud` testid / no link yet.

- [ ] **Step 3: Replace the component (five elements + header geometry + transparent search)**

`apps/web/features/chat/components/ChatTopBar.tsx`:
```tsx
"use client";

import { GlassSurface, Icon, SearchBar, Stack } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { LimitsRings } from "../../../components/layout/LimitsRings/LimitsRings";
import { LangSwitch } from "./LangSwitch";
import { StatusPill } from "./StatusPill";

export enum ChatTopBarTestId {
  Root = "chat-top-bar",
  Search = "chat-top-bar-search",
  Hud = "chat-top-bar-hud",
  Lang = "chat-top-bar-lang",
}

export interface ChatTopBarProps {
  onOpenPalette: () => void;
}

/**
 * The Velín-D glass top bar — exactly five elements, left→right: the live status
 * pill (+ the phase-3a flyout), the ⌘K searchbox, the Claude limits gauge, a switch
 * back to the HUD UI, and the language selector. A 56px transparent header; every
 * element carries its own single GlassSurface (no mode sign, no clock — not in the
 * design). The searchbox uses the transparent surface so the glass shows through;
 * the HUD switch is a 40×40 circular glass link to the classic HUD overview.
 */
export function ChatTopBar({ onOpenPalette }: ChatTopBarProps) {
  const t = useTranslations("chat");

  return (
    <Stack
      align="center"
      as="header"
      data-testid={ChatTopBarTestId.Root}
      direction="row"
      gap="150"
      style={{ height: "56px" }}
    >
      <GlassSurface radius="pill">
        <StatusPill />
      </GlassSurface>

      <GlassSurface data-testid={ChatTopBarTestId.Search} radius="pill" style={{ width: 190 }}>
        <SearchBar
          ariaLabel={t("palette.placeholder")}
          onClick={onOpenPalette}
          placeholder={t("palette.placeholder")}
          shortcut="⌘K"
          surface="transparent"
        />
      </GlassSurface>

      <GlassSurface radius="pill">
        <LimitsRings />
      </GlassSurface>

      <GlassSurface data-testid={ChatTopBarTestId.Hud} radius="pill" style={{ height: 40, width: 40 }}>
        <Link
          aria-label={t("hudSwitchLabel")}
          className="flex size-10 items-center justify-center text-foreground-dim outline-none transition-colors hover:text-accent focus-visible:text-accent"
          href="/overview"
        >
          <Icon name="grid" size="sm" />
        </Link>
      </GlassSurface>

      <GlassSurface data-testid={ChatTopBarTestId.Lang} radius="pill">
        <LangSwitch />
      </GlassSurface>
    </Stack>
  );
}
```
(The HUD `<Link>` mirrors `ChatToolDock`'s sanctioned icon-link Tailwind chrome. `t("hudSwitchLabel")` renders as its key path until Task 7 — the test asserts the link's `href`, not the label, so it passes now.)

- [ ] **Step 4: Set the bar band to 56px total (drop the wrapper's vertical padding)**

In `apps/web/features/chat/components/ChatScreen.tsx`, change the top-bar band wrapper (around line 477):
```tsx
      <div className="relative z-20 shrink-0 px-[22px] py-[13px]">
```
to:
```tsx
      <div className="relative z-20 shrink-0 px-[22px]">
```
(The 56px header now owns the band height; `px-[22px]` keeps the design's `0 22px` horizontal inset. The design's `position:relative`/`overflow:visible` on the bar are non-load-bearing here — the status flyout portals to `document.body` and the limits/lang popovers self-contain/portal — so they are intentionally omitted.)

- [ ] **Step 5: Run tests to verify pass**

Run: `cd apps/web && pnpm exec vitest run --config vitest.components.config.ts features/chat --reporter=basic`
Expected: PASS.

- [ ] **Step 6: Gates**

Run: `rtk pnpm check:lint && rtk pnpm check:types && pnpm exec tsc -p apps/web --noEmit`
Expected: clean. (If `check:lint` flags the `<Link>` `className` — it won't: raw Tailwind on feature-local nav links is the established `ChatToolDock` pattern — mirror `DOCK_LINK_CLASS` exactly.)

- [ ] **Step 7: Commit**

```bash
rtk git add apps/web/features/chat/components/ChatTopBar.tsx apps/web/features/chat/components/ChatTopBar.test.tsx apps/web/features/chat/components/ChatScreen.tsx && rtk git commit -m "feat(chat): 1:1 top bar — transparent searchbox, HUD switch, 56px header"
```

---

### Task 6: `StatusPill` inner-border removal (transparency fidelity)

**Files:**
- Modify: `apps/web/features/chat/components/StatusPill.tsx` (the post-3a file)
- Modify: `apps/web/features/chat/components/StatusPill.test.tsx`

**Interfaces:**
- Consumes: the 3a `StatusPill` (segments-as-buttons, `id`, flyout mount) — untouched except the root `className`.
- Produces: the pill root no longer draws its own border (the surrounding `GlassSurface` provides the single border), removing the doubled concentric border inside the glass.

- [ ] **Step 1: Add the failing test**

Add this `it` inside the existing `describe("StatusPill", …)` (the post-3a test file already mocks `useSubsystemsQuery` and `./StatusFlyoutPanel`):
```tsx
  it("does not draw its own border (single glass border, no doubling)", () => {
    renderWithProviders(<StatusPill />);
    expect(screen.getByTestId(StatusPillTestId.Root)).not.toHaveClass("border-border");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm exec vitest run --config vitest.components.config.ts features/chat/components/StatusPill.test.tsx --reporter=basic`
Expected: FAIL — the root still has `border-border`.

- [ ] **Step 3: Remove the inner border from the root `className`**

In `StatusPill.tsx`, change the pill root:
```tsx
      className="rounded-full border border-border px-[14px] py-[6px]"
```
to:
```tsx
      className="rounded-full px-[14px] py-[6px]"
```
Change **only** this `className` — every other attribute (`data-testid`, `id={STATUS_PILL_DOM_ID}`, `onBlur`, `onMouseEnter`, `onMouseLeave`, `ref`) and all 3a segment/flyout JSX stay exactly as they are.

- [ ] **Step 4: Run tests to verify pass**

Run: `cd apps/web && pnpm exec vitest run --config vitest.components.config.ts features/chat/components/StatusPill.test.tsx --reporter=basic`
Expected: PASS (the new test plus every 3a test).

- [ ] **Step 5: Gates**

Run: `rtk pnpm check:lint && rtk pnpm check:types && pnpm exec tsc -p apps/web --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/web/features/chat/components/StatusPill.tsx apps/web/features/chat/components/StatusPill.test.tsx && rtk git commit -m "fix(chat): drop the status pill's inner border so the glass border is single"
```

---

### Task 7: i18n catalogs + parity (the ONLY task that edits cs.json/en.json)

**Files:**
- Modify: `apps/web/i18n/messages/cs.json`, `apps/web/i18n/messages/en.json`
- Modify: `apps/web/i18n/messages/parity.test.ts`

- [ ] **Step 1: Confirm `chat.modeLabel` has no surviving consumer**

Run: `rtk grep "modeLabel" apps/web` (exclude `.next/`). Expect matches only in `cs.json`/`en.json` (and, historically, the now-deleted ChatTopBar mode group). If any `.tsx`/`.ts` source still calls `t("modeLabel")`, STOP and reconcile before removing the key.

- [ ] **Step 2: Extend the failing parity test**

Add this `it` inside the existing `describe("i18n catalog parity", …)` in `parity.test.ts`:
```ts
  it("has the phase-3b HUD-switch key and drops the removed mode label", () => {
    expect(keys(en)).toContain("chat.hudSwitchLabel");
    expect(keys(cs)).toContain("chat.hudSwitchLabel");
    expect(keys(en)).not.toContain("chat.modeLabel");
    expect(keys(cs)).not.toContain("chat.modeLabel");
  });
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm exec vitest run apps/web/i18n/messages/parity.test.ts --reporter=basic`
Expected: FAIL — `chat.hudSwitchLabel` missing and `chat.modeLabel` still present.

- [ ] **Step 4: Swap the key in both catalogs**

Inside the `"chat"` object (near line 1605), replace the `modeLabel` entry — this both removes `modeLabel` and adds `hudSwitchLabel` in one edit, preserving the file's indentation.

`apps/web/i18n/messages/en.json`:
```json
    "modeLabel": "CHAT",
```
→
```json
    "hudSwitchLabel": "Switch to HUD",
```

`apps/web/i18n/messages/cs.json`:
```json
    "modeLabel": "CHAT",
```
→
```json
    "hudSwitchLabel": "Přepnout na HUD",
```
Do NOT touch any other key (the parity test's `cs`/`en` key-set equality still holds — one key removed, one added, in both).

- [ ] **Step 5: Run parity + the chat component tests to verify pass**

Run: `pnpm exec vitest run apps/web/i18n/messages/parity.test.ts --reporter=basic && cd apps/web && pnpm exec vitest run --config vitest.components.config.ts features/chat --reporter=basic`
Expected: PASS — the HUD `aria-label` now resolves to real copy; component tests assert testids/href, so nothing else shifts.

- [ ] **Step 6: Gates**

Run: `rtk pnpm check:lint && rtk pnpm check:types && pnpm exec tsc -p apps/web --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
rtk git add apps/web/i18n && rtk git commit -m "chore(i18n): add chat.hudSwitchLabel, drop chat.modeLabel (top-bar 1:1)"
```

---

### Task 8: Final gates + live `:3000` transparency verification (PARK)

**Files:** none (verification only; a follow-up fix commit if a live defect is found).

- [ ] **Step 1: Full gates**

Run: `rtk pnpm check:lint && rtk pnpm check:types && pnpm exec tsc -p apps/web --noEmit`
Expected: clean.

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: green, ignoring only the ledger's documented pre-existing flakes (`apps/api` runner-core, tasks.e2e, approvals.e2e, budget.e2e, agent-runs.e2e) — none of which 3b touches.

- [ ] **Step 3: Live `:3000` verification (mandatory — jsdom cannot see glass or geometry)**

The dev server on `:3000` is typically already running and is NOT ours to restart — never kill it; only start `pnpm web:dev` if nothing is listening. Browser automation goes through `rtk proxy` (rtk mangles playwright output); beware the `.playwright-mcp/` Fast-Refresh trap — screenshot only after the page has settled. Open `http://localhost:3000/chat` **and, side-by-side, `design/Z.I.B.B.Y/ZIBBY Velin-D.html`** and compare:
- **Transparency (the #1 checklist):** each of the five elements reads as **one** glass layer — the orb-map gradient/art blurs through every pill; the searchbox has **no** opaque rectangle inside it (the glass shows through end-to-end); the language pill is a **single** tint/blur (no doubled/darker glass); the status pill has a **single** border (no concentric double line). Nothing behind any pill is a flat fill.
- **Element set + order:** left→right status · search · limits · HUD · lang. **No** butler/mode sign, **no** mode dot, **no** clock.
- **Geometry:** bar band ~56px tall; searchbox ~190px wide with the `search` icon, `Hledat…` placeholder and the `⌘K` chip; HUD switch is a 40×40 **circle**; the four non-status pills sit ~40px tall, gap ~12px.
- **Language selector:** the trigger shows only `CZ`/`EN` (no full word); clicking opens the portalled menu with an **accent border** + rotated chevron and full labels + a check on the active row; picking `EN` switches the whole UI to English and the trigger flips to `EN`; picking `CZ` switches back.
- **HUD switch:** clicking the grid icon navigates to `/overview` (the classic HUD); hover/focus brightens the icon to accent.
- **Search:** clicking the searchbox (and `⌘K`) still opens the command palette (unchanged contract).
- **Status flyout (3a) still works:** hovering a status segment still opens its flyout over the orb map (3b did not regress it).
- **Sanctioned deltas vs the static prototype — do NOT "correct" these back:** the HUD link's `hover/focus-visible:text-accent` brighten and the searchbox's `hover:border-border-strong hover:text-foreground-dim` are spec-sanctioned interaction additions NOT present in the design HTML (the prototype codes no `:hover` styles at all — it relies on the bare glass look). A hover-state mismatch with the prototype is expected and correct; only the RESTING state must match 1:1.
Capture one screenshot of the settled `/chat` top bar for the ledger.

- [ ] **Step 4: Fix any live defect, re-run the affected gate, commit**

Likely live-only classes: a `<Link>` needing `"use client"` context (unlikely — `ChatTopBar` already declares it), a `pointer-events` swallow from the chat wrapper over the HUD link, a portal z-fight on the lang menu, or the 190px width clipping a long placeholder. Fix, re-run the relevant test/gate, then:
```bash
rtk git add apps/web && rtk git commit -m "fix(chat): live-verify corrections for top-bar 1:1 alignment"
```

- [ ] **Step 5: PARK at the PR gate**

Do **not** push and do **not** open a PR. Update `.superpowers/sdd3/progress.md` (3b completion + park + any live-pass/deviation notes) and report the final commit hash to the operator. If the self-knowledge pre-commit hook aborts any commit above: run `pnpm self-knowledge:generate`, verify the staged set (`rtk git status`), retry. Never `--no-verify`.

---

## Self-Review

**1. Spec coverage** — §1 scope (five elements, remove mode+clock) → Tasks 4 (removal) + 5 (five-element restructure). §2 3a end state (only StatusPill inner-border touched) → Task 6, and the Global Constraints forbid other 3a edits. §3 geometry (56px header, 190 search, 40×40 HUD, gap-150, content-driven heights) → Task 5 + Global Constraints (verbatim design values). §4.1 SearchBar `surface` → Task 1; §4.2 Dropdown `compact` → Task 2; §4.3 LangSwitch (incl. `LangSwitchTestId` removal) → Task 3; §4.4 ChatTopBar contract (enum `Root/Search/Hud/Lang`, `onOpenPalette`-only props, `Stack as="header"` substitution) → Tasks 4+5; §4.5 HUD switch (`/overview`, grid glyph, glass link) → Task 5; §4.6 StatusPill border removal → Task 6. §5 transparency (single glass, three named fixes) → Tasks 1/3/6 + the Task 8 live checklist. §6 interaction (search trigger unchanged, lang dropdown, HUD link, limits non-change) → Tasks 3/5 + reuse note. §7 i18n table (add `chat.hudSwitchLabel`, remove `chat.modeLabel`, reuse `topbar.langSwitcherLabel`, endonyms inline) → Task 7 (sole catalog task). §8 testing split (jsdom structure vs live pixels) → per-task unit tests + Task 8. §9 removals (full orphan cascade: mode derivation chain, mode-derivation test suite, `ChatScreenTestId.ModeDot`, `chatMode.ts` deletion, reversibility) → Task 4 Steps 4-6 (one dedicated commit). §10 acceptance → Task 8 checklist. §11 deviations (gap/heights/limits popover/lang border/hover sanction) → Global Constraints + Task 5 Step 4 note (position/overflow omitted) + Task 8 (limits solid popover accepted; hover states not "corrected" back). No spec section is unassigned.

**2. Placeholder scan** — No "TBD"/"similar to Task N"/"add later". Every code step prints the full file body or the exact old→new edit; every test step has runnable code, the exact command, and the expected result. The verification-only guards (Task 4 Step 4j orphan-sweep grep, Task 4 Step 6 `chatMode` importer grep, Task 7 Step 1 `modeLabel` grep) name the exact command, the expected output, and the STOP condition, and constrain the change to the verified scope — not a contract.

**3. Type consistency across tasks** — `SearchBarProps.surface?: "solid" | "transparent"` (Task 1) is consumed exactly as `surface="transparent"` in Task 5. `DropdownSingleProps.compact?: boolean` (Task 2) is consumed as `compact` on the single `Dropdown` in Task 3 (LangSwitch) — `variant="inline"`, `size="sm"`, options `{ value, code, label }` matching the single-select shape. `ChatTopBarTestId` gains `Hud` in Task 5 and loses `Mode`/`Clock` in Task 4; the tests reference only the members that exist at each step (Task 4 tests `Root/Search/Lang` + absent literals; Task 5 adds `Hud`). `ChatTopBarProps` drops `mode` in Task 4 and the call site plus the whole derivation chain, its test suite, `ChatScreenTestId.ModeDot`, and the `chatMode.ts` module are removed in the same task — no later task references `mode`, `ChatMode`, `MODE_DOT`, or `ModeDot`. `STATUS_PILL_DOM_ID`/`StatusPillTestId` (from 3a) are untouched by Task 6 except the root `className` string. `t("hudSwitchLabel")` (Task 5) is backed by the `chat.hudSwitchLabel` key added in Task 7; between them next-intl's missing-key fallback renders the key path and no test asserts the copy. `DropdownTestId.Trigger`/`.Panel` (DS barrel, confirmed exported) are used by the Task 2 and Task 3 tests. `renderWithProviders`/`screen`/`within` all come from `apps/web/test/render.tsx` (which re-exports Testing Library). The i18n parity helper `keys()` is reused verbatim from the existing test.
</content>
