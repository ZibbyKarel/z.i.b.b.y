# Subsystem Detail Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `SubsystemDrawer` from a docked, no-backdrop side panel into a true modal over the Velín canvas, with a calm scale/fade entrance and a mirrored exit animation.

**Architecture:** All changes are local to `SubsystemDrawer.tsx` (a bespoke fixed backdrop + the existing `Panel`, no new component, no shared `Dialog` changes) plus relocating one currently-unused hook to a shared location so this is its first real consumer. A small local `phase` state machine (`"entering" | "open" | "closing"`) drives two exported pure style-builder functions; closing defers the `onClose` prop call until the exit transition finishes.

**Tech Stack:** Next.js 15 / React 19, TypeScript strict, Tailwind v4, `@zibby/design-system` (`Container`, `Panel`), Vitest + Testing Library.

## Global Constraints

- pnpm only — never `npm`/`yarn`.
- No `any`; `strict: true` + `noUncheckedIndexedAccess`.
- No `forwardRef` — React 19 ref-as-prop (not needed here, this plan doesn't create new components).
- Never write inline `style={{…}}` on a raw DOM element in `apps/web` (`react/forbid-dom-props`) — route dynamic styles through a DS component's own `style` passthrough (`Container`, `Panel`) instead. Every style object in this plan is applied via `Container`'s or `Panel`'s `style` prop, never a raw `<div style>`.
- Every DS-adjacent visual helper that returns a plain value (like the existing `headerBandStyle`) is exported so tests can assert it directly, matching this file's own established idiom.
- After every task's code changes: `pnpm check:lint`, `pnpm check:types`, `pnpm test` (or `pnpm web:test` for a faster narrow run) — fix all errors before moving to the next task.
- Commit after each task.

---

### Task 1: Relocate `usePrefersReducedMotion` to the shared hooks folder

This hook (`apps/web/features/chat/hooks/usePrefersReducedMotion.ts`) currently has zero
consumers anywhere in the app — it reads `prefers-reduced-motion` once at mount, guarded for
environments without `matchMedia` (jsdom). `SubsystemDrawer` (in the `subsystems` feature, a
different domain) is about to become its first real consumer. Per this repo's own precedent
(`apps/web/hooks/useNow.ts`, `apps/web/hooks/useDebouncedValue.ts` — generic, cross-domain,
non-query hooks live there, not inside one feature), move it there rather than reaching across
feature boundaries or duplicating the logic.

**Files:**
- Create: `apps/web/hooks/usePrefersReducedMotion.ts` (moved, content unchanged)
- Create: `apps/web/hooks/usePrefersReducedMotion.test.ts` (new — the hook has no test today)
- Delete: `apps/web/features/chat/hooks/usePrefersReducedMotion.ts`

**Interfaces:**
- Produces: `usePrefersReducedMotion(): boolean` — imported by Task 2 as
  `import { usePrefersReducedMotion } from "../../../../hooks/usePrefersReducedMotion";`
  from `apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx`.

- [ ] **Step 1: Move the file**

```bash
git mv apps/web/features/chat/hooks/usePrefersReducedMotion.ts apps/web/hooks/usePrefersReducedMotion.ts
```

The file's content stays exactly as-is:

```ts
"use client";

import { useState } from "react";

/**
 * Whether the operator asked the OS for reduced motion — read once at mount
 * (no subscription: the orb is remounted with the chat overlay often enough
 * that live-tracking the media query buys nothing, and a one-shot read keeps
 * the WebGL uniforms/frame-loop wiring branch-free after init).
 *
 * Guarded for environments without `matchMedia` (jsdom in component tests
 * exposes none) — those report `false`, matching the media query's own
 * "no preference" default.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  return reduced;
}
```

- [ ] **Step 2: Write the test**

Create `apps/web/hooks/usePrefersReducedMotion.test.ts`:

```ts
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

describe("usePrefersReducedMotion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when the OS has no reduced-motion preference", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false }),
    );
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it("returns true when the OS prefers reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true }),
    );
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it("returns false when matchMedia is unavailable (jsdom default)", () => {
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it passes**

Run: `pnpm --filter web exec vitest run apps/web/hooks/usePrefersReducedMotion.test.ts`
Expected: 3 tests PASS (this is pure relocation — nothing was broken to make fail first, so
this step's "verify" is confirming the moved file still works, not a red→green cycle).

- [ ] **Step 4: Verify no stale import remains**

Run: `grep -rn "features/chat/hooks/usePrefersReducedMotion" apps/web`
Expected: no output.

- [ ] **Step 5: Full verification and commit**

```bash
pnpm check:lint
pnpm check:types
pnpm test
git add apps/web/hooks/usePrefersReducedMotion.ts apps/web/hooks/usePrefersReducedMotion.test.ts
git commit -m "chore(web): relocate usePrefersReducedMotion to shared hooks

Its only consumer so far lived in a different feature (chat); moving it
out of features/chat/hooks ahead of SubsystemDrawer becoming its first
real caller, per the existing apps/web/hooks/ precedent (useNow,
useDebouncedValue)."
```

---

### Task 2: Convert `SubsystemDrawer` into a modal — backdrop, entrance/exit animation, deferred close

**Files:**
- Modify: `apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx`
- Modify: `apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.test.tsx`
- Modify: `apps/web/features/chat/components/ChatScreen.tsx` (comment only, no behavior change)

**Interfaces:**
- Consumes: `usePrefersReducedMotion(): boolean` from Task 1.
- Produces (new exports from `SubsystemDrawer.tsx`, for Task 3 and for tests):
  - `type SubsystemDrawerPhase = "entering" | "open" | "closing"`
  - `PANEL_ENTER_MS = 220`, `PANEL_EXIT_MS = 140`, `BACKDROP_ENTER_MS = 180`, `BACKDROP_EXIT_MS = 140` (all exported `number` constants)
  - `backdropStyle(phase: SubsystemDrawerPhase): CSSProperties`
  - `panelTransitionStyle(phase: SubsystemDrawerPhase, reducedMotion: boolean): CSSProperties`
  - `SubsystemDrawerTestId.Root` now identifies the fixed backdrop (was the docked wrapper) — same enum member, new meaning, no consumer outside this file's own tests reads it structurally.

- [ ] **Step 1: Update the two existing close tests to expect a deferred `onClose`**

The deferred-close state machine below means `onClose` no longer fires synchronously — it
fires after a 140ms exit transition. Update these first so they fail against the *current*
synchronous implementation, confirming the test itself is meaningful before you change the
component.

In `SubsystemDrawer.test.tsx`, replace:

```ts
  it("closes via the header close button", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<SubsystemDrawer onClose={onClose} subsystem={fixture()} />);

    await user.click(screen.getByTestId(SubsystemDrawerTestId.Close));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
```

with:

```ts
  it("closes via the header close button after the exit transition", async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<SubsystemDrawer onClose={onClose} subsystem={fixture()} />);

    await user.click(screen.getByTestId(SubsystemDrawerTestId.Close));
    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(PANEL_EXIT_MS);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
```

And replace:

```ts
  it("closes on Escape", () => {
    const onClose = vi.fn();
    renderWithProviders(<SubsystemDrawer onClose={onClose} subsystem={fixture()} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
```

with:

```ts
  it("closes on Escape after the exit transition", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    renderWithProviders(<SubsystemDrawer onClose={onClose} subsystem={fixture()} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(PANEL_EXIT_MS);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
```

Add `afterEach` (alongside the existing `beforeEach` at the top of the `describe` block) so a
fake-timers test never leaks into the next one:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
```

```ts
  beforeEach(() => {
    markSeenMutate.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
```

Update the top import line to pull in the new exports:

```ts
import {
  SubsystemDrawer,
  SubsystemDrawerTestId,
  backdropStyle,
  headerBandStyle,
  panelTransitionStyle,
  PANEL_EXIT_MS,
} from "./SubsystemDrawer";
```

- [ ] **Step 2: Run the suite to verify the two updated tests fail**

Run: `pnpm --filter web exec vitest run SubsystemDrawer.test.tsx`
Expected: FAIL — `backdropStyle`/`panelTransitionStyle`/`PANEL_EXIT_MS` don't exist yet (import
error), and even once that's stubbed, `onClose` still fires synchronously today. This confirms
the tests exercise the not-yet-built behavior.

- [ ] **Step 3: Update imports and add the animation constants + style builders**

In `SubsystemDrawer.tsx`, change the import block (currently lines 1–22):

```ts
"use client";

import type { SubsystemState, SubsystemWithStatus } from "@zibby/contracts";
import {
  Container,
  Icon,
  ORB_STATE,
  Orb,
  Panel,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Tag,
  type TagTone,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../../../../hooks/usePrefersReducedMotion";
import { useMarkSubsystemSeenMutation } from "../../mutations/useMarkSubsystemSeenMutation";
import { SUBSYSTEM_GLYPH, SUBSYSTEM_ORB_STATE } from "../../subsystemVisuals";
import { AktivitaTab } from "./AktivitaTab";
import { ArtefaktyTab } from "./ArtefaktyTab";
import { GatesTab } from "./GatesTab";
import { RosterTab } from "./RosterTab";
```

Add these new exports right after the `SubsystemDrawerTestId` enum (which stays as-is):

```ts
/**
 * The modal's own lifecycle, independent of the `open`/mounted question (the
 * parent controls mounting via `{selectedSubsystem && <SubsystemDrawer .../>}`
 * — this only tracks the animation state within that mounted lifetime).
 * `"entering"` is the one-frame initial paint (hidden), flipped to `"open"`
 * by an effect right after mount so the browser has a "from" state to
 * transition away from rather than painting the open state immediately.
 */
export type SubsystemDrawerPhase = "entering" | "open" | "closing";

export const PANEL_ENTER_MS = 220;
export const PANEL_EXIT_MS = 140;
export const BACKDROP_ENTER_MS = 180;
export const BACKDROP_EXIT_MS = 140;
const PANEL_EASE_ENTER = "cubic-bezier(0.16, 1, 0.3, 1)";
const MODAL_WIDTH = "800px";

/**
 * The backdrop's fade — same both directions except duration/easing: 180ms
 * ease-out opening, 140ms ease-in closing (a plain reverse, no extra blur
 * ramp — Velín-D design spec, phase 125).
 */
export function backdropStyle(phase: SubsystemDrawerPhase): CSSProperties {
  const open = phase === "open";
  const duration = phase === "closing" ? BACKDROP_EXIT_MS : BACKDROP_ENTER_MS;
  const easing = phase === "closing" ? "ease-in" : "ease-out";
  return {
    background: "rgba(11, 14, 19, 0.55)",
    backdropFilter: "blur(14px) saturate(140%)",
    opacity: open ? 1 : 0,
    transition: `opacity ${duration}ms ${easing}`,
  };
}

/**
 * The panel's entrance/exit: fade + scale(0.96→1) + translateY(8px→0), 220ms
 * overshoot-free ease-out opening, mirrored 140ms ease-in closing. Under
 * `prefers-reduced-motion` the `transform` half is dropped entirely (both the
 * target value and the transitioned property) — a plain opacity fade, per
 * the design spec.
 */
export function panelTransitionStyle(
  phase: SubsystemDrawerPhase,
  reducedMotion: boolean,
): CSSProperties {
  const open = phase === "open";
  const duration = phase === "closing" ? PANEL_EXIT_MS : PANEL_ENTER_MS;
  const easing = phase === "closing" ? "ease-in" : PANEL_EASE_ENTER;
  const properties = reducedMotion ? ["opacity"] : ["opacity", "transform"];
  return {
    opacity: open ? 1 : 0,
    transform: reducedMotion
      ? undefined
      : open
        ? "scale(1) translateY(0)"
        : "scale(0.96) translateY(8px)",
    transition: properties.map((property) => `${property} ${duration}ms ${easing}`).join(", "),
  };
}
```

- [ ] **Step 4: Add the phase state machine and `requestClose` inside the component**

Inside `SubsystemDrawer`, right after the existing `const seenIdRef = useRef<string | null>(null);`
line, add:

```ts
  const reducedMotion = usePrefersReducedMotion();
  const [phase, setPhase] = useState<SubsystemDrawerPhase>("entering");
  const closingRef = useRef(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flips "entering" → "open" right after mount, so the browser has a
  // distinct "from" paint to transition away from instead of rendering the
  // fully-open state on the very first frame.
  useEffect(() => {
    setPhase("open");
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  // Any close trigger (Escape, backdrop click, header close button) calls
  // this instead of `onClose` directly: it plays the exit transition, THEN
  // calls the real `onClose` prop once it's done — the parent only unmounts
  // this component after that.
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setPhase("closing");
    closeTimeoutRef.current = setTimeout(onClose, PANEL_EXIT_MS);
  }, [onClose]);
```

- [ ] **Step 5: Wire `requestClose` into the existing Escape effect and the close button**

Replace the existing Escape effect:

```ts
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);
```

with:

```ts
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [requestClose]);
```

Change the close button's `onClick={onClose}` to `onClick={requestClose}` (still the same
button, same testid, same `aria-label`).

- [ ] **Step 6: Replace the docked wrapper with the fixed backdrop + centered panel**

Replace the component's `return` block's outer structure. Original:

```tsx
  return (
    <div
      className="pointer-events-none absolute inset-y-0 right-0 z-30 flex w-full flex-col p-4 lg:left-[316px] lg:w-auto"
      data-testid={SubsystemDrawerTestId.Root}
    >
      <div className="pointer-events-auto flex h-full w-full flex-col">
        <Panel
          elevated
          aria-label={t("drawer.ariaLabel", { name: subsystem.name })}
          data-testid={SubsystemDrawerTestId.Panel}
          ref={panelRef}
          role="region"
          // Bounded to the height this root wrapper is actually given (its
          // `inset-y-0` resolves against `ChatScreen`'s middle band, between
          // the top bar and the composer — see `ChatScreen.tsx`'s outer/inner
          // main-area split, Phase 99) with its own scroll — a computed value
          // with no dedicated `Panel` prop, routed through its `style`
          // passthrough (sanctioned per CLAUDE.md). `100%` (not a viewport
          // `calc`) so the cap always matches that band exactly, however tall
          // the top bar/composer render — the old `calc(100vh - 96px)` guessed
          // a fixed reserve that was shorter than the actual chrome, so the
          // panel's bottom (and the GatesTab "Add rule" button at the end of
          // it) spilled past this wrapper into the composer's band. Still a
          // v1 simplification that scrolls the whole card as one unit rather
          // than pinning the tab bar — fine now that every tab (85-88) renders
          // real, potentially long content.
          style={{ maxHeight: "100%", overflowY: "auto" }}
          tabIndex={-1}
        >
```

New:

```tsx
  return (
    <Container
      bottom="0"
      data-testid={SubsystemDrawerTestId.Root}
      left="0"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      padding="200"
      position="fixed"
      right="0"
      style={{
        alignItems: "center",
        display: "flex",
        justifyContent: "center",
        ...backdropStyle(phase),
      }}
      top="0"
      zIndex={40}
    >
      <Panel
        elevated
        aria-label={t("drawer.ariaLabel", { name: subsystem.name })}
        data-testid={SubsystemDrawerTestId.Panel}
        ref={panelRef}
        role="region"
        // Sized as a centered modal (phase 125 — was a docked, viewport-minus-
        // rail-wide panel through phase 99): a fixed width, capped so it never
        // overflows a narrow viewport, same `calc(100vw - 32px)` pattern the
        // DS `Dialog` uses. `maxHeight: "100%"` resolves against the backdrop
        // `Container` above (a `position: fixed` box with `padding="200"`, so
        // effectively "the viewport minus 16px on every side") with its own
        // scroll — a computed value with no dedicated `Panel` prop, routed
        // through its `style` passthrough (sanctioned per CLAUDE.md). Still a
        // v1 simplification that scrolls the whole card as one unit rather
        // than pinning the tab bar — fine now that every tab (85-88) renders
        // real, potentially long content. `panelTransitionStyle` layers the
        // entrance/exit animation on top of this same style object.
        style={{
          maxHeight: "100%",
          maxWidth: "calc(100vw - 32px)",
          overflowY: "auto",
          width: MODAL_WIDTH,
          ...panelTransitionStyle(phase, reducedMotion),
        }}
        tabIndex={-1}
      >
```

And at the very end of the component, replace the closing tags. Original:

```tsx
        </Panel>
      </div>
    </div>
  );
}
```

New:

```tsx
        </Panel>
    </Container>
  );
}
```

- [ ] **Step 7: Run the suite to verify the two deferred-close tests now pass**

Run: `pnpm --filter web exec vitest run SubsystemDrawer.test.tsx`
Expected: PASS, including the two updated tests. (Other existing tests in this file — header
identity, glyph, status, count badge, markSeen, focus-restore, tab switching, header band —
should still pass unchanged; the DOM they check for `Root`/`Panel`/`Hero`/etc. testids is
unaffected by the wrapper-element swap.)

- [ ] **Step 8: Add new tests for the backdrop, animation styles, and click-to-close**

Add to `SubsystemDrawer.test.tsx`, inside the top-level `describe` block:

```ts
  describe("modal backdrop and animation (phase 125)", () => {
    it("renders fully open once mounted (not stuck in the entering state)", () => {
      renderWithProviders(<SubsystemDrawer onClose={vi.fn()} subsystem={fixture()} />);
      const panel = screen.getByTestId(SubsystemDrawerTestId.Panel);
      expect(panel).toHaveStyle({ opacity: "1", transform: "scale(1) translateY(0)" });
    });

    it("blurs and dims the backdrop", () => {
      renderWithProviders(<SubsystemDrawer onClose={vi.fn()} subsystem={fixture()} />);
      const backdrop = screen.getByTestId(SubsystemDrawerTestId.Root);
      expect(backdrop.style.backdropFilter).toBe("blur(14px) saturate(140%)");
      expect(backdrop.style.background).toBe("rgba(11, 14, 19, 0.55)");
    });

    it("closes when clicking the backdrop itself", () => {
      vi.useFakeTimers();
      const onClose = vi.fn();
      renderWithProviders(<SubsystemDrawer onClose={onClose} subsystem={fixture()} />);

      fireEvent.click(screen.getByTestId(SubsystemDrawerTestId.Root));
      expect(onClose).not.toHaveBeenCalled();

      vi.advanceTimersByTime(PANEL_EXIT_MS);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not close when clicking inside the panel", () => {
      vi.useFakeTimers();
      const onClose = vi.fn();
      renderWithProviders(<SubsystemDrawer onClose={onClose} subsystem={fixture()} />);

      fireEvent.click(screen.getByTestId(SubsystemDrawerTestId.Panel));
      vi.advanceTimersByTime(PANEL_EXIT_MS);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("collapses to a fade-only transition under prefers-reduced-motion", () => {
      vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
      renderWithProviders(<SubsystemDrawer onClose={vi.fn()} subsystem={fixture()} />);

      const panel = screen.getByTestId(SubsystemDrawerTestId.Panel);
      expect(panel.style.transform).toBe("");
      expect(panel.style.transition).toBe("opacity 220ms cubic-bezier(0.16, 1, 0.3, 1)");
      vi.unstubAllGlobals();
    });
  });

  describe("backdropStyle / panelTransitionStyle (pure)", () => {
    it("backdropStyle fades in 180ms ease-out open, 140ms ease-in closing", () => {
      expect(backdropStyle("open")).toMatchObject({
        opacity: 1,
        transition: "opacity 180ms ease-out",
      });
      expect(backdropStyle("closing")).toMatchObject({
        opacity: 0,
        transition: "opacity 140ms ease-in",
      });
    });

    it("panelTransitionStyle scales+translates+fades open, hides entering/closing", () => {
      expect(panelTransitionStyle("open", false)).toMatchObject({
        opacity: 1,
        transform: "scale(1) translateY(0)",
        transition:
          "opacity 220ms cubic-bezier(0.16, 1, 0.3, 1), transform 220ms cubic-bezier(0.16, 1, 0.3, 1)",
      });
      expect(panelTransitionStyle("entering", false)).toMatchObject({
        opacity: 0,
        transform: "scale(0.96) translateY(8px)",
      });
      expect(panelTransitionStyle("closing", false).transition).toBe(
        "opacity 140ms ease-in, transform 140ms ease-in",
      );
    });

    it("drops transform entirely under reduced motion", () => {
      const style = panelTransitionStyle("open", true);
      expect(style.transform).toBeUndefined();
      expect(style.transition).toBe("opacity 220ms cubic-bezier(0.16, 1, 0.3, 1)");
    });
  });
```

- [ ] **Step 9: Run the full suite to verify everything passes**

Run: `pnpm --filter web exec vitest run SubsystemDrawer.test.tsx`
Expected: all tests PASS.

- [ ] **Step 10: Update the `ChatScreen.tsx` mounting comment (no behavior change)**

In `ChatScreen.tsx`, replace the comment above `{selectedSubsystem && <SubsystemDrawer .../>}`.
Original:

```tsx
        {/* ── Subsystem drawer (Phase 84) ─────────────────────────────────
            An inline panel over the chat, never a page navigation — docked right
            of the map on lg+. Selecting a subsystem in the web above swaps this
            drawer's content rather than opening a second one. Mounted as a sibling
            of the inner z-10 wrapper (Phase 99) so its own z-index competes with
            the root-level chrome rather than being capped by that wrapper's
            stacking context. */}
```

New:

```tsx
        {/* ── Subsystem detail modal (Phase 84, reworked Phase 125) ────────
            Was a docked-right, no-backdrop panel through Phase 99; now a true
            modal over the whole Velín canvas — `SubsystemDrawer` renders its
            own `position: fixed` backdrop (z-40), which escapes this
            wrapper's stacking context on its own, so no special mounting
            position is needed here any more. Selecting a subsystem in the web
            above still swaps this drawer's content rather than opening a
            second one. */}
```

No other lines in `ChatScreen.tsx` change — `{selectedSubsystem && <SubsystemDrawer onClose={...} subsystem={...} />}` stays exactly as it is; `position: fixed` needs no special DOM placement to work correctly here.

- [ ] **Step 11: Full verification and commit**

```bash
pnpm check:lint
pnpm check:types
pnpm test
git add apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx \
        apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.test.tsx \
        apps/web/features/chat/components/ChatScreen.tsx
git commit -m "feat(chat): subsystem detail becomes a modal, with open/close animation

SubsystemDrawer drops the docked, no-backdrop treatment for a centered
modal over the Velín canvas: blurred/dimmed backdrop, calm scale+fade
entrance (220ms, overshoot-free ease-out), mirrored 140ms ease-in exit.
Closing is now deferred — Escape/backdrop-click/close-button play the
exit transition before the onClose prop actually fires. Respects
prefers-reduced-motion (fade only, no scale/translate)."
```

---

### Task 3: Focus trap and body-scroll lock

`SubsystemDrawer` already hand-rolls Escape-to-close and focus-restore-on-unmount (both
untouched by Task 2). As a real modal it also needs Tab-cycling focus containment and a body
scroll lock — both currently absent since it wasn't a real modal before. This ports the same
idiom the DS `Dialog` component already uses (`FOCUSABLE_SELECTOR` + Tab-keydown handling),
duplicated locally per the Task 2 design decision to keep this component independent of
`Dialog`.

**Files:**
- Modify: `apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx`
- Modify: `apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.test.tsx`

**Interfaces:**
- Consumes: `requestClose` (from Task 2, same component) — the Tab handler is added into the
  same keydown effect that already calls `requestClose()` on Escape.
- Produces: no new exports — this task only makes the existing modal properly trap focus and
  lock scroll; nothing outside the component needs to call into it.

- [ ] **Step 1: Write the failing tests**

Add to `SubsystemDrawer.test.tsx`, inside the top-level `describe` block:

```ts
  describe("focus trap and scroll lock (phase 125)", () => {
    it("wraps Tab focus from the last focusable element back to the first", () => {
      renderWithProviders(<SubsystemDrawer onClose={vi.fn()} subsystem={fixture()} />);

      screen.getByRole("tab", { name: "Artefakty" }).focus();
      fireEvent.keyDown(document, { key: "Tab" });

      expect(document.activeElement).toBe(screen.getByTestId(SubsystemDrawerTestId.Close));
    });

    it("wraps Shift+Tab from the first focusable element back to the last", () => {
      renderWithProviders(<SubsystemDrawer onClose={vi.fn()} subsystem={fixture()} />);

      screen.getByTestId(SubsystemDrawerTestId.Close).focus();
      fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

      expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Artefakty" }));
    });

    it("locks body scroll while open and restores it on unmount", () => {
      const { unmount } = renderWithProviders(
        <SubsystemDrawer onClose={vi.fn()} subsystem={fixture()} />,
      );
      expect(document.body.style.overflow).toBe("hidden");

      unmount();
      expect(document.body.style.overflow).toBe("");
    });
  });
```

- [ ] **Step 2: Run the suite to verify these three tests fail**

Run: `pnpm --filter web exec vitest run SubsystemDrawer.test.tsx`
Expected: FAIL — Tab currently does nothing (no wrap), and `document.body.style.overflow` is
never touched today.

- [ ] **Step 3: Add the `FOCUSABLE_SELECTOR` constant**

Near the top of `SubsystemDrawer.tsx`, right after the imports, add:

```ts
// Same idiom the DS `Dialog` component uses for its own focus trap —
// duplicated here rather than imported, per the Task 2 design decision to
// keep this modal independent of `Dialog` (see the phase-125 design spec).
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
```

- [ ] **Step 4: Extend the keydown effect with Tab-cycling**

Replace the effect from Task 2 (Escape-only):

```ts
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [requestClose]);
```

with:

```ts
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const container = panelRef.current;
      if (!container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        container.focus();
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || active === container) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [requestClose]);
```

- [ ] **Step 5: Add the body-scroll-lock effect**

Add a new effect near the other lifecycle effects (after the focus-restore effect):

```ts
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);
```

- [ ] **Step 6: Run the suite to verify all three tests now pass**

Run: `pnpm --filter web exec vitest run SubsystemDrawer.test.tsx`
Expected: all tests PASS, including the whole file's prior tests (unaffected).

- [ ] **Step 7: Full verification and commit**

```bash
pnpm check:lint
pnpm check:types
pnpm test
git add apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx \
        apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.test.tsx
git commit -m "feat(chat): subsystem detail modal traps focus and locks body scroll

Tab now cycles within the modal (wrapping both directions) and the page
behind it can't scroll while it's open — both were missing since the
component wasn't a real modal before phase 125."
```
