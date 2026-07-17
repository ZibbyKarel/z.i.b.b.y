# Task Detail Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `ChatTaskDetailColumn` from a docked, no-backdrop column into a true
centered modal — the exact same treatment `SubsystemDrawer` got in phase 125.

**Architecture:** Add a local `"entering" | "open" | "closing"` phase state machine and
two pure style-helper functions (`backdropStyle`, `panelTransitionStyle`) to
`ChatTaskDetailColumn.tsx`, wrap the existing `Panel`+`RunDetail` body in a full-viewport
backdrop `Container`, and defer the real `onClose` call until the exit transition
finishes (Task 1). Then add Tab focus-trap cycling and wire the already-existing shared
`useOverlayStack` hook for scroll-lock + Escape/Tab precedence (Task 2) — no new hook
needed this time, unlike phase 125.

**Tech Stack:** Next.js 15 App Router, React 19, `@zibby/design-system` (`Container`,
`Panel`, `Pressable`, `useOverlayStack`), Tailwind v4, Vitest + Testing Library.

## Global Constraints

- React 19 — no `forwardRef`; refs are plain props.
- No `any`. `strict: true` + `noUncheckedIndexedAccess`.
- DS-composed only in `apps/web`: no raw inline `style={{}}` on a DOM element. Computed
  values (the animation styles) are spread into a DS `Container`/`Panel`'s own `style`
  passthrough prop — same pattern `SubsystemDrawer` already uses.
- `<Component>TestId` enum + `data-testid` on every important part (already exists for
  this component — `ChatTaskDetailColumnTestId`, unchanged in this plan).
- Reuse existing i18n keys verbatim — do not add new ones: `chat.tasks.openFull`,
  `chat.tasks.closeDetail`, `chat.tasks.detailAriaLabel`.
- Exact animation values (copy verbatim, identical to `SubsystemDrawer`'s phase-125
  constants):
  - Backdrop: `background: rgba(11, 14, 19, 0.55)`, `backdropFilter: blur(14px) saturate(140%)`,
    enter 180ms ease-out, exit 140ms ease-in.
  - Panel: `opacity 0→1`, `transform: scale(0.96) translateY(8px) → scale(1) translateY(0)`,
    enter 220ms `cubic-bezier(0.16, 1, 0.3, 1)`, exit 140ms ease-in. Under
    `prefers-reduced-motion`, drop `transform` entirely (opacity-only transition).
  - Width: fixed `800px`, capped `max-width: calc(100vw - 32px)`.
- `FOCUSABLE_SELECTOR` is duplicated locally (not imported from `Dialog` or
  `SubsystemDrawer`) — matches the established precedent in both of those files. This
  will be the THIRD copy in the codebase after this plan; not a regression, but flag it
  in the final report as a candidate for extraction in a future phase (not this one).
- `fireEvent`, not `userEvent`, in any new test combined with `vi.useFakeTimers()` — the
  only working pattern in this codebase's RTL/React 19 setup (see `SubsystemDrawer.test.tsx`'s
  own comment on this).
- After each task: `pnpm check:lint && pnpm check:types && pnpm test` must be green
  before commit.

---

### Task 1: Backdrop, panel entrance/exit animation, and deferred close

**Files:**
- Modify: `apps/web/features/chat/components/ChatTaskDetailColumn.tsx`
- Modify: `apps/web/features/chat/components/ChatTaskDetailColumn.test.tsx`
- Modify: `apps/web/features/chat/components/ChatScreen.tsx` (one stale comment, see Step 5a)

**Interfaces:**
- Produces: `export type ChatTaskDetailPhase = "entering" | "open" | "closing";`,
  `export const PANEL_ENTER_MS = 220`, `export const PANEL_EXIT_MS = 140`,
  `export const BACKDROP_ENTER_MS = 180`, `export const BACKDROP_EXIT_MS = 140`,
  `export function backdropStyle(phase: ChatTaskDetailPhase): CSSProperties`,
  `export function panelTransitionStyle(phase: ChatTaskDetailPhase, reducedMotion: boolean): CSSProperties`.
  Task 2 consumes `PANEL_EXIT_MS` and the `phase`/`requestClose` machinery this task
  creates.
- Consumes: `usePrefersReducedMotion` from `apps/web/hooks/usePrefersReducedMotion.ts`
  (already exists, already used by `SubsystemDrawer` — import path from this file is
  `"../../../hooks/usePrefersReducedMotion"`, three levels up since
  `ChatTaskDetailColumn.tsx` sits directly in `components/`, not in its own subfolder
  like `SubsystemDrawer/SubsystemDrawer.tsx`).

- [ ] **Step 1: Write the failing tests for the new backdrop/animation behavior**

Add this new `describe` block at the end of `ChatTaskDetailColumn.test.tsx` (inside the
existing top-level `describe`, after the last `it`), and add the two new imports at the
top of the file:

```ts
import {
  ChatTaskDetailColumn,
  ChatTaskDetailColumnTestId,
  PANEL_EXIT_MS,
  backdropStyle,
  panelTransitionStyle,
} from "./ChatTaskDetailColumn";
```

(This replaces the existing `import { ChatTaskDetailColumn, ChatTaskDetailColumnTestId } from "./ChatTaskDetailColumn";` line.)

Also change the existing `import { describe, expect, it, vi } from "vitest";` line to
add `afterEach`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
```

Then add this `afterEach` right after the mock declarations, before the first `describe`:

```ts
afterEach(() => {
  vi.useRealTimers();
});
```

Then append the new tests:

```ts
describe("modal backdrop and animation (phase 126)", () => {
  it("renders fully open once mounted (not stuck in the entering state)", () => {
    render(
      <ChatTaskDetailColumn
        deleting={false}
        glyph="bot"
        now={Date.now()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onResume={vi.fn()}
        onStop={vi.fn()}
        resuming={false}
        run={run({})}
        stopping={false}
      />,
    );
    const panel = screen.getByTestId(ChatTaskDetailColumnTestId.Panel);
    expect(panel).toHaveStyle({ opacity: "1", transform: "scale(1) translateY(0)" });
  });

  it("blurs and dims the backdrop", () => {
    render(
      <ChatTaskDetailColumn
        deleting={false}
        glyph="bot"
        now={Date.now()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onResume={vi.fn()}
        onStop={vi.fn()}
        resuming={false}
        run={run({})}
        stopping={false}
      />,
    );
    const backdrop = screen.getByTestId(ChatTaskDetailColumnTestId.Root);
    expect(backdrop.style.backdropFilter).toBe("blur(14px) saturate(140%)");
    expect(backdrop.style.background).toBe("rgba(11, 14, 19, 0.55)");
  });

  it("closes when clicking the backdrop itself, after the exit transition", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <ChatTaskDetailColumn
        deleting={false}
        glyph="bot"
        now={Date.now()}
        onClose={onClose}
        onDelete={vi.fn()}
        onResume={vi.fn()}
        onStop={vi.fn()}
        resuming={false}
        run={run({})}
        stopping={false}
      />,
    );

    fireEvent.click(screen.getByTestId(ChatTaskDetailColumnTestId.Root));
    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(PANEL_EXIT_MS);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when clicking inside the panel", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <ChatTaskDetailColumn
        deleting={false}
        glyph="bot"
        now={Date.now()}
        onClose={onClose}
        onDelete={vi.fn()}
        onResume={vi.fn()}
        onStop={vi.fn()}
        resuming={false}
        run={run({})}
        stopping={false}
      />,
    );

    fireEvent.click(screen.getByTestId(ChatTaskDetailColumnTestId.Panel));
    vi.advanceTimersByTime(PANEL_EXIT_MS);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("collapses to a fade-only transition under prefers-reduced-motion", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    render(
      <ChatTaskDetailColumn
        deleting={false}
        glyph="bot"
        now={Date.now()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onResume={vi.fn()}
        onStop={vi.fn()}
        resuming={false}
        run={run({})}
        stopping={false}
      />,
    );

    const panel = screen.getByTestId(ChatTaskDetailColumnTestId.Panel);
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

Also update the existing `"the close button fires onClose"` test — the close now defers
via `setTimeout`, so it must use fake timers and advance past `PANEL_EXIT_MS`:

```ts
it("the close button fires onClose after the exit transition", () => {
  vi.useFakeTimers();
  const onClose = vi.fn();
  render(
    <ChatTaskDetailColumn
      deleting={false}
      glyph="bot"
      now={Date.now()}
      onClose={onClose}
      onDelete={vi.fn()}
      onResume={vi.fn()}
      onStop={vi.fn()}
      resuming={false}
      run={run({})}
      stopping={false}
    />,
  );

  fireEvent.click(screen.getByTestId(ChatTaskDetailColumnTestId.Close));
  expect(onClose).not.toHaveBeenCalled();

  vi.advanceTimersByTime(PANEL_EXIT_MS);
  expect(onClose).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && pnpm exec vitest run -c vitest.components.config.ts ChatTaskDetailColumn.test.tsx`
Expected: FAIL — `backdropStyle`/`panelTransitionStyle` don't exist yet (import error),
`ChatTaskDetailColumnTestId.Root` doesn't render backdrop styles, and the close-button
test now expects a deferred call that doesn't happen yet.

- [ ] **Step 3: Rewrite `ChatTaskDetailColumn.tsx` with the backdrop, phase machine, and deferred close**

Replace the file's full contents with:

```tsx
"use client";

import {
  Container,
  Divider,
  Icon,
  type IconName,
  Panel,
  Pressable,
  Stack,
  Typography,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../../../hooks/usePrefersReducedMotion";
import { RunDetail } from "../../runs/components/RunDetail";
import { type RunView, runTitle } from "../../runs/run";

export enum ChatTaskDetailColumnTestId {
  Root = "chat-task-detail-column",
  Panel = "chat-task-detail-panel",
  Close = "chat-task-detail-close",
  OpenFull = "chat-task-detail-open-full",
}

/**
 * The modal's own lifecycle, independent of the `open`/mounted question (the
 * parent controls mounting via `{selectedRun && <ChatTaskDetailColumn .../>}`
 * — this only tracks the animation state within that mounted lifetime).
 * Same idiom as `SubsystemDrawerPhase` (phase 125).
 */
export type ChatTaskDetailPhase = "entering" | "open" | "closing";

export const PANEL_ENTER_MS = 220;
export const PANEL_EXIT_MS = 140;
export const BACKDROP_ENTER_MS = 180;
export const BACKDROP_EXIT_MS = 140;
const PANEL_EASE_ENTER = "cubic-bezier(0.16, 1, 0.3, 1)";
const MODAL_WIDTH = "800px";

/**
 * The backdrop's fade — same both directions except duration/easing: 180ms
 * ease-out opening, 140ms ease-in closing (a plain reverse, no extra blur
 * ramp — Velín-D design spec, phase 126, identical values to `SubsystemDrawer`).
 */
export function backdropStyle(phase: ChatTaskDetailPhase): CSSProperties {
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
 * `prefers-reduced-motion` the `transform` half is dropped entirely.
 */
export function panelTransitionStyle(
  phase: ChatTaskDetailPhase,
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

export interface ChatTaskDetailColumnProps {
  run: RunView;
  glyph: IconName;
  avatar?: string;
  now: number;
  onStop: () => void;
  stopping: boolean;
  onDelete: () => void;
  deleting: boolean;
  onResume: () => void;
  resuming: boolean;
  /** Clears the selection — the column's own close button, or re-clicking the
   * already-selected row in {@link ChatTasksPanel}. */
  onClose: () => void;
}

/**
 * The chat screen's task detail (Phase 100, frame Phase 122, modal Phase 126):
 * a centered modal over the whole Velín canvas, opened from a row in the left
 * tasks gutter (`ChatTasksPanel`). Was a docked column immediately right of the
 * gutter through Phase 122 (no backdrop, gutter stayed interactive beside it);
 * now the same true-modal treatment `SubsystemDrawer` got in Phase 125 — see
 * that component and `docs/superpowers/specs/2026-07-17-task-detail-modal-design.md`.
 * Reuses {@link RunDetail} verbatim as the body; this component only supplies
 * the surrounding modal chrome (backdrop, entrance/exit animation, floating
 * close, footer "open full page" escape).
 */
export function ChatTaskDetailColumn({
  run,
  glyph,
  avatar,
  now,
  onStop,
  stopping,
  onDelete,
  deleting,
  onResume,
  resuming,
  onClose,
}: ChatTaskDetailColumnProps) {
  const t = useTranslations("chat.tasks");
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  const reducedMotion = usePrefersReducedMotion();
  const [phase, setPhase] = useState<ChatTaskDetailPhase>("entering");
  const closingRef = useRef(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flips "entering" → "open" right after mount — same idiom and same
  // `react-hooks/set-state-in-effect` justification as `SubsystemDrawer`
  // (phase 125): a `requestAnimationFrame` deferral would desync from
  // `renderWithProviders`' synchronous `act()` flush in tests.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase("open");
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  // Any close trigger (backdrop click, header close button) calls this
  // instead of `onClose` directly: it plays the exit transition, THEN calls
  // the real `onClose` prop once it's done.
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setPhase("closing");
    closeTimeoutRef.current = setTimeout(onClose, PANEL_EXIT_MS);
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  return (
    <Container
      bottom="0"
      data-testid={ChatTaskDetailColumnTestId.Root}
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
        aria-label={t("detailAriaLabel", { title: runTitle(run) })}
        data-testid={ChatTaskDetailColumnTestId.Panel}
        ref={panelRef}
        role="region"
        style={{
          maxHeight: "100%",
          maxWidth: "calc(100vw - 32px)",
          overflow: "hidden",
          position: "relative",
          width: MODAL_WIDTH,
          ...panelTransitionStyle(phase, reducedMotion),
        }}
        tabIndex={-1}
      >
        <Container position="absolute" right="12px" top="12px" zIndex={10}>
          <Pressable
            aria-label={t("closeDetail")}
            data-testid={ChatTaskDetailColumnTestId.Close}
            onClick={requestClose}
          >
            <Icon name="x" size="sm" tone="faint" />
          </Pressable>
        </Container>
        <Container overflowY="auto" padding="200" style={{ height: "100%" }}>
          <Stack gap="200">
            <RunDetail
              avatar={avatar}
              deleting={deleting}
              glyph={glyph}
              now={now}
              onDelete={onDelete}
              onResume={onResume}
              onStop={onStop}
              resuming={resuming}
              run={run}
              stopping={stopping}
            />
            <Divider />
            <Stack align="center" as="footer" direction="row" justify="center">
              <Pressable
                data-testid={ChatTaskDetailColumnTestId.OpenFull}
                onClick={() => router.push(`/runs?run=${run.runId}` as Route)}
              >
                <Stack align="center" direction="row" gap="50">
                  <Icon name="expand" size="xs" tone="faint" />
                  <Typography mono size="2xs" type="note" variant="tertiary">
                    {t("openFull")}
                  </Typography>
                </Stack>
              </Pressable>
            </Stack>
          </Stack>
        </Container>
      </Panel>
    </Container>
  );
}
```

Note: the keydown effect (Escape) and the `FOCUSABLE_SELECTOR`/Tab-trap logic are
deliberately NOT in this version — Task 2 adds both, wired through `useOverlayStack`.
This step's file has no Escape handling at all yet (that's expected and correct for
this step — do not add a bare Escape effect here only to replace it in Task 2).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && pnpm exec vitest run -c vitest.components.config.ts ChatTaskDetailColumn.test.tsx`
Expected: all tests pass, including the 4 pre-existing ones and the new ones from Step 1.

- [ ] **Step 5a: Fix the stale mount comment in `ChatScreen.tsx`**

The comment immediately above `{selectedRun && <ChatTaskDetailColumn ...>}` still
describes the pre-modal docked layout. Find this block in `ChatScreen.tsx`:

```tsx
        {/* ── Task detail column (Phase 100) ──────────────────────────────
            A click in `ChatTasksPanel` (the 300px left gutter above) opens the
            run's detail HERE, immediately to its right. Mounted the same way the
            subsystem drawer is — a sibling, outside the inner z-10 wrapper — so its
            own z-index competes directly with the chrome; the two never overlap
            (opposite sides of the same band). */}
        {selectedRun && (
```

Replace the comment (keep the `{selectedRun && (` line unchanged) with:

```tsx
        {/* ── Task detail modal (Phase 100, frame Phase 122, modal Phase 126) ──
            A click in `ChatTasksPanel` (the 300px left gutter above) opens the
            run's detail as a true modal over the whole Velín canvas — same
            treatment `SubsystemDrawer` got in Phase 125.
            `ChatTaskDetailColumn` renders its own `position: fixed` backdrop
            (z-40), which escapes this wrapper's stacking context on its own, so
            no special mounting position is needed here. It now covers the left
            gutter while open, same as the subsystem drawer already does. */}
        {selectedRun && (
```

- [ ] **Step 5b: Full verification**

Run: `pnpm check:lint && pnpm check:types && pnpm test`
Expected: no new errors/failures anywhere in the monorepo.

- [ ] **Step 6: Commit**

```bash
git add apps/web/features/chat/components/ChatTaskDetailColumn.tsx apps/web/features/chat/components/ChatTaskDetailColumn.test.tsx apps/web/features/chat/components/ChatScreen.tsx
git commit -m "feat(chat): task detail becomes a modal, with open/close animation"
```

---

### Task 2: Focus trap and shared scroll-lock (via `useOverlayStack`)

**Files:**
- Modify: `apps/web/features/chat/components/ChatTaskDetailColumn.tsx`
- Modify: `apps/web/features/chat/components/ChatTaskDetailColumn.test.tsx`

**Interfaces:**
- Consumes: `useOverlayStack` from `@zibby/design-system` (already exists —
  `libs/design-system/src/hooks/useOverlayStack.ts`, built in phase 125 Task 4,
  returns `{ isTopmost: () => boolean }`). Consumes `requestClose`/`phase` from Task 1.
- Produces: nothing new exported — this task only adds internal behavior (keydown
  effect, `FOCUSABLE_SELECTOR` constant) to the same component.

- [ ] **Step 1: Write the failing tests**

Add this `describe` block at the end of `ChatTaskDetailColumn.test.tsx`. First, add a
new import for `Dialog`:

```ts
import { Dialog } from "@zibby/design-system";
```

Then change the existing test-utils import line from:
```ts
import { renderWithProviders as render, screen } from "../../../test/render";
```
to (adds the plain, undecorated `render`, aliased so it doesn't collide with the
existing `renderWithProviders as render` — the nested-`Dialog` regression test needs a
plain render for the second overlay, matching `SubsystemDrawer.test.tsx`'s own pattern):
```ts
import { render as bareRender, renderWithProviders as render, screen } from "../../../test/render";
```

Then append:

```ts
describe("focus trap and scroll lock (phase 126)", () => {
  it("wraps Tab focus from the last focusable element back to the first", () => {
    render(
      <ChatTaskDetailColumn
        deleting={false}
        glyph="bot"
        now={Date.now()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onResume={vi.fn()}
        onStop={vi.fn()}
        resuming={false}
        run={run({})}
        stopping={false}
      />,
    );

    screen.getByTestId(ChatTaskDetailColumnTestId.OpenFull).focus();
    fireEvent.keyDown(document, { key: "Tab" });

    expect(document.activeElement).toBe(screen.getByTestId(ChatTaskDetailColumnTestId.Close));
  });

  it("wraps Shift+Tab from the first focusable element back to the last", () => {
    render(
      <ChatTaskDetailColumn
        deleting={false}
        glyph="bot"
        now={Date.now()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onResume={vi.fn()}
        onStop={vi.fn()}
        resuming={false}
        run={run({})}
        stopping={false}
      />,
    );

    screen.getByTestId(ChatTaskDetailColumnTestId.Close).focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(screen.getByTestId(ChatTaskDetailColumnTestId.OpenFull));
  });

  it("locks body scroll while open and restores it on unmount", () => {
    const { unmount } = render(
      <ChatTaskDetailColumn
        deleting={false}
        glyph="bot"
        now={Date.now()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onResume={vi.fn()}
        onStop={vi.fn()}
        resuming={false}
        run={run({})}
        stopping={false}
      />,
    );
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("cedes Escape to a nested DS Dialog and keeps scroll locked until this modal itself closes", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { unmount } = render(
      <ChatTaskDetailColumn
        deleting={false}
        glyph="bot"
        now={Date.now()}
        onClose={onClose}
        onDelete={vi.fn()}
        onResume={vi.fn()}
        onStop={vi.fn()}
        resuming={false}
        run={run({})}
        stopping={false}
      />,
    );
    expect(document.body.style.overflow).toBe("hidden");

    const { unmount: unmountDialog } = bareRender(
      <Dialog open title="Nested">
        nested
      </Dialog>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    vi.advanceTimersByTime(PANEL_EXIT_MS);
    expect(onClose).not.toHaveBeenCalled();

    unmountDialog();
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
```

Also add an Escape-closes test (there wasn't one before, since the column had no
keyboard handling at all pre-Task-2):

```ts
it("closes on Escape after the exit transition", () => {
  vi.useFakeTimers();
  const onClose = vi.fn();
  render(
    <ChatTaskDetailColumn
      deleting={false}
      glyph="bot"
      now={Date.now()}
      onClose={onClose}
      onDelete={vi.fn()}
      onResume={vi.fn()}
      onStop={vi.fn()}
      resuming={false}
      run={run({})}
      stopping={false}
    />,
  );

  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).not.toHaveBeenCalled();

  vi.advanceTimersByTime(PANEL_EXIT_MS);
  expect(onClose).toHaveBeenCalledTimes(1);
});
```
(Add this inside the same new `describe("focus trap and scroll lock (phase 126)", ...)` block.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && pnpm exec vitest run -c vitest.components.config.ts ChatTaskDetailColumn.test.tsx`
Expected: FAIL — Tab/Shift+Tab do nothing (no keydown handler yet), scroll isn't locked
(`document.body.style.overflow` stays `''`), Escape does nothing.

- [ ] **Step 3: Add `FOCUSABLE_SELECTOR`, the keydown effect, and `useOverlayStack`**

In `ChatTaskDetailColumn.tsx`:

1. Add `useOverlayStack` to the `@zibby/design-system` import list (alphabetical, so
   after `Typography`):

```ts
import {
  Container,
  Divider,
  Icon,
  type IconName,
  Panel,
  Pressable,
  Stack,
  Typography,
  useOverlayStack,
} from "@zibby/design-system";
```

2. Add this constant right after the imports, before `ChatTaskDetailColumnTestId`:

```ts
// Same idiom the DS `Dialog` and `SubsystemDrawer` use for their own focus
// traps — duplicated here rather than imported/shared, matching the
// established precedent in both of those files.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
```

3. Inside the component, right after the `requestClose` `useCallback` (before the
   focus-restore `useEffect`), add:

```ts
  // Shares the DS `Dialog`'s overlay stack (the same one `SubsystemDrawer`
  // uses): `true` for this component's whole mounted lifetime, including the
  // `"closing"` phase, since the parent doesn't unmount it until
  // `requestClose`'s deferred `onClose` fires — scroll must stay locked
  // through the exit animation too.
  const { isTopmost } = useOverlayStack(true);

  // Escape closes; Tab/Shift+Tab cycles focus within the panel. Both are
  // no-ops when another overlay (a nested DS `Dialog`, etc.) is topmost.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!isTopmost()) return;
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
  }, [requestClose, isTopmost]);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && pnpm exec vitest run -c vitest.components.config.ts ChatTaskDetailColumn.test.tsx`
Expected: all tests pass, including every test from Task 1 and Task 2.

- [ ] **Step 5: Full verification**

Run: `pnpm check:lint && pnpm check:types && pnpm test`
Expected: no new errors/failures anywhere in the monorepo.

- [ ] **Step 6: Commit**

```bash
git add apps/web/features/chat/components/ChatTaskDetailColumn.tsx apps/web/features/chat/components/ChatTaskDetailColumn.test.tsx
git commit -m "feat(chat): task detail modal traps focus and locks body scroll"
```

## Final whole-branch review

After both tasks are complete and reviewed individually, dispatch a final code-reviewer
subagent over the diff from this plan's start commit (`HEAD` at plan-start time) through
the Task 2 commit — this is a small, two-commit addition on top of an already-reviewed
branch, so the final review's scope is this plan's own diff, not the entire
`feat/chat-ui-design-align` history since `main`.
