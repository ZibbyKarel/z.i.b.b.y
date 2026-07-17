# Task-list idle float Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give idle cards in the chat left tasklist (`ChatTaskRow`) a faint, independently-staggered floating drift, without touching the shared `Card` primitive or the live-task "breathing" glow.

**Architecture:** A new, generic DS wrapper component `FloatingPanel` applies a `translateY`-only keyframe (`ztFloat`) via a Tailwind animate token, staggered per an `index` prop using `duration = 6s + (index % 4) * 0.7s`, `delay = index * -1.3s`. `ChatTaskRow` wraps its existing `Card` output in `FloatingPanel` only when the row is idle (not `running`/`awaiting-approval`); `ChatTasksPanel` threads each row's list position through as `index`.

**Tech Stack:** React 19, Tailwind v4 (`@theme` tokens in `libs/design-system/src/theme/globals.css`), Vitest + Testing Library, Storybook.

## Global Constraints

- No `forwardRef` — React 19 ref-as-prop (not applicable here; no ref forwarding needed).
- No `any` in TypeScript.
- Props interface named `<Component>Props`, always exported.
- Every DS component declares a `<Component>TestId` enum and wires `data-testid`; tests select via `getByTestId`.
- No inline `style={{...}}` on a raw DOM element in `apps/web` (not applicable — the only inline `style` in this plan is inside `FloatingPanel.tsx`, which lives in `libs/design-system`, not `apps/web`).
- Run `pnpm check:lint && pnpm check:types && pnpm test` after all tasks; fix all errors before considering the work done.
- Effect scope: `translateY` only, amplitude capped at 3px, no opacity/shadow/scale change, idle cards only (never a `running`/`awaiting-approval` row).

---

### Task 1: `FloatingPanel` DS primitive + `ztFloat` token

**Files:**
- Create: `libs/design-system/src/components/FloatingPanel/FloatingPanel.tsx`
- Create: `libs/design-system/src/components/FloatingPanel/FloatingPanel.test.tsx`
- Create: `libs/design-system/src/components/FloatingPanel/FloatingPanel.stories.tsx`
- Modify: `libs/design-system/src/theme/globals.css`
- Modify: `libs/design-system/src/index.ts`

**Interfaces:**
- Produces: `FloatingPanel({ children: ReactNode; index?: number })` — a component rendering a `<div data-testid={FloatingPanelTestId.Root}>` that wraps `children` unchanged visually and adds the float animation. `FloatingPanelTestId.Root = "floating-panel-root"`. Both `FloatingPanel` and `FloatingPanelTestId` (and the `FloatingPanelProps` type) are exported from `@zibby/design-system` (the package's `libs/design-system/src/index.ts`).

- [ ] **Step 1: Write the failing test**

Create `libs/design-system/src/components/FloatingPanel/FloatingPanel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FloatingPanel, FloatingPanelTestId } from "./FloatingPanel";

describe("FloatingPanel", () => {
  it("renders its children unchanged", () => {
    render(
      <FloatingPanel>
        <span data-testid="child">hi</span>
      </FloatingPanel>,
    );
    expect(screen.getByTestId("child")).toHaveTextContent("hi");
  });

  it("applies the float animation and honours reduced motion, defaulting to index 0", () => {
    render(
      <FloatingPanel>
        <span />
      </FloatingPanel>,
    );
    const root = screen.getByTestId(FloatingPanelTestId.Root);
    expect(root.className).toContain("animate-zt-float");
    expect(root.className).toContain("motion-reduce:animate-none");
    expect(root.style.animationDuration).toBe("6s");
    expect(root.style.animationDelay).toBe("0s");
  });

  it("staggers duration/delay by the given index", () => {
    render(
      <FloatingPanel index={5}>
        <span />
      </FloatingPanel>,
    );
    const root = screen.getByTestId(FloatingPanelTestId.Root);
    expect(root.style.animationDuration).toBe("6.7s");
    expect(root.style.animationDelay).toBe("-6.5s");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run libs/design-system/src/components/FloatingPanel/FloatingPanel.test.tsx`
Expected: FAIL — `Cannot find module './FloatingPanel'` (file doesn't exist yet).

- [ ] **Step 3: Add the `ztFloat` keyframe and `--animate-zt-float` token**

In `libs/design-system/src/theme/globals.css`, in the `@theme` block's `---- Animations ----` section, immediately after the existing line:

```css
  --animate-spinner: zt-spin 0.7s linear infinite;
```

add:

```css
  /* Idle "floating on water" drift for otherwise-static cards — amplitude
   * capped at 3px, translateY only (no opacity/shadow — that's zt-live's job). */
  --animate-zt-float: ztFloat 7s ease-in-out infinite;
```

Then, in the `Keyframes` section, immediately after the existing block:

```css
@keyframes zt-spin {
  to {
    transform: rotate(360deg);
  }
}
```

add:

```css
@keyframes ztFloat {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-3px);
  }
}
```

- [ ] **Step 4: Write `FloatingPanel.tsx`**

Create `libs/design-system/src/components/FloatingPanel/FloatingPanel.tsx`:

```tsx
import type { CSSProperties, ReactNode } from "react";

export enum FloatingPanelTestId {
  Root = "floating-panel-root",
}

export interface FloatingPanelProps {
  children: ReactNode;
  /** Stagger seed — typically the item's list index. Panels sharing the same
   *  index float in lockstep; vary it (e.g. list index) to break the
   *  synchronized wave. Defaults to 0 (a single un-staggered panel). */
  index?: number;
}

/**
 * Ambient "floating on water" drift for otherwise-idle content — a pure
 * transform host with no background, border, or radius of its own, so it
 * never changes the wrapped content's appearance or hitbox beyond a few
 * pixels of vertical drift. Reuses the shared `zt-float` keyframe
 * (`libs/design-system/src/theme/globals.css`), staggered per `index` so
 * multiple panels never move in unison. Honours `prefers-reduced-motion`
 * via Tailwind's `motion-reduce:` variant — the same mechanism
 * {@link LivingGlow} uses, rather than a separate animation-toggle switch.
 */
export function FloatingPanel({ children, index = 0 }: FloatingPanelProps) {
  const style: CSSProperties = {
    animationDelay: `${index * -1.3}s`,
    animationDuration: `${6 + (index % 4) * 0.7}s`,
  };
  return (
    <div
      className="w-full animate-zt-float motion-reduce:animate-none"
      data-testid={FloatingPanelTestId.Root}
      style={style}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `rtk vitest run libs/design-system/src/components/FloatingPanel/FloatingPanel.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Add the Storybook story**

Create `libs/design-system/src/components/FloatingPanel/FloatingPanel.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { FloatingPanel } from "./FloatingPanel";

const meta: Meta<typeof FloatingPanel> = {
  title: "DesignSystem/FloatingPanel",
  component: FloatingPanel,
  parameters: { backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof FloatingPanel>;

function Swatch({ index }: { index: number }) {
  return (
    <FloatingPanel index={index}>
      <div className="flex h-16 w-40 items-center justify-center rounded-lg border border-border bg-surface">
        <Typography type="note">index {index}</Typography>
      </div>
    </FloatingPanel>
  );
}

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-3 p-12">
      <Typography type="label">
        each panel drifts on its own duration/delay — watch a few seconds to see the wave break
      </Typography>
      <div className="flex items-start gap-6">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Swatch index={index} key={index} />
        ))}
      </div>
    </div>
  ),
};
```

- [ ] **Step 7: Export from the DS package**

In `libs/design-system/src/index.ts`, immediately after the existing block:

```ts
export { LivingGlow, LivingGlowTestId } from "./components/LivingGlow/LivingGlow";
export type { LivingGlowIntensity, LivingGlowProps } from "./components/LivingGlow/LivingGlow";
```

add:

```ts
export { FloatingPanel, FloatingPanelTestId } from "./components/FloatingPanel/FloatingPanel";
export type { FloatingPanelProps } from "./components/FloatingPanel/FloatingPanel";
```

- [ ] **Step 8: Run the full DS test suite and lint/typecheck**

Run: `rtk vitest run libs/design-system`
Expected: PASS, no regressions.

Run: `pnpm check:lint && pnpm check:types`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
rtk git add libs/design-system/src/components/FloatingPanel libs/design-system/src/theme/globals.css libs/design-system/src/index.ts
rtk git commit -m "feat(design-system): add FloatingPanel idle-drift primitive"
```

---

### Task 2: Wire `ChatTaskRow` to float idle rows

**Files:**
- Modify: `apps/web/features/chat/components/ChatTaskRow.tsx`
- Modify: `apps/web/features/chat/components/ChatTaskRow.test.tsx`

**Interfaces:**
- Consumes: `FloatingPanel({ children, index })` and `FloatingPanelTestId.Root` from `@zibby/design-system` (Task 1).
- Produces: `ChatTaskRowProps.index?: number` (defaults to `0`) — later consumed by `ChatTasksPanel` (Task 3).

- [ ] **Step 1: Write the failing tests**

In `apps/web/features/chat/components/ChatTaskRow.test.tsx`, add `FloatingPanelTestId` to the imports:

```tsx
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FloatingPanelTestId } from "@zibby/design-system";
import { renderWithProviders as render, screen } from "../../../test/render";
import type { RunView } from "../../runs/run";
import { ChatTaskRow, ChatTaskRowTestId } from "./ChatTaskRow";
```

Add two new `it` blocks at the end of the `describe("ChatTaskRow ...")` block, right before its closing `});`:

```tsx
  it("wraps an idle row in FloatingPanel but renders a live row bare", () => {
    const live = render(
      <ChatTaskRow
        glyph="bot"
        onSelect={vi.fn()}
        openAria="Open run: Live task"
        run={run({ runId: "run_live", title: "Live task", status: "running" })}
        selected={false}
        stateLabel="Running"
      />,
    );
    expect(live.queryByTestId(FloatingPanelTestId.Root)).not.toBeInTheDocument();
    live.unmount();

    const idle = render(
      <ChatTaskRow
        glyph="bot"
        onSelect={vi.fn()}
        openAria="Open run: Done task"
        run={run({ runId: "run_done", title: "Done task", status: "done" })}
        selected={false}
        stateLabel="Done"
      />,
    );
    expect(idle.getByTestId(FloatingPanelTestId.Root)).toBeInTheDocument();
  });

  it("forwards its stagger index to FloatingPanel", () => {
    render(
      <ChatTaskRow
        index={5}
        glyph="bot"
        onSelect={vi.fn()}
        openAria="Open run: Done task"
        run={run({ runId: "run_done", title: "Done task", status: "done" })}
        selected={false}
        stateLabel="Done"
      />,
    );
    const panel = screen.getByTestId(FloatingPanelTestId.Root);
    expect(panel.style.animationDuration).toBe("6.7s");
    expect(panel.style.animationDelay).toBe("-6.5s");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk vitest run apps/web/features/chat/components/ChatTaskRow.test.tsx`
Expected: FAIL — both new tests fail (`FloatingPanelTestId.Root` never appears; `ChatTaskRowProps` has no `index`, so TypeScript will also flag the `index={5}` prop once Step 3 hasn't happened — that's expected at this point).

- [ ] **Step 3: Wire `ChatTaskRow.tsx`**

In `apps/web/features/chat/components/ChatTaskRow.tsx`, update the import block (add `FloatingPanel`, keeping the existing alphabetical order):

```tsx
import { useState } from "react";
import {
  Card,
  Container,
  type DotTone,
  FloatingPanel,
  Icon,
  type IconName,
  IconTile,
  Progress,
  Stack,
  type StateTone,
  StatusDot,
  Typography,
} from "@zibby/design-system";
import { compactAgo } from "../../../utils/time";
import { type RunView, runStateTone, runTitle } from "../../runs/run";
import { RunStateBadge } from "../../runs/components/RunStateBadge";
```

Add `index` to `ChatTaskRowProps` (after the existing `onSelect` field):

```tsx
  /** Selects (or, re-clicking the already-selected row, deselects) this run — the
   * panel resolves the click into the inline detail column beside it. */
  onSelect: (runId: string) => void;
  /** This row's position in its list — the stagger seed `FloatingPanel` uses so
   * idle rows don't float in visible unison. Defaults to 0. */
  index?: number;
}
```

Update the function signature to destructure `index = 0`:

```tsx
export function ChatTaskRow({
  run,
  glyph,
  avatar,
  stateLabel,
  openAria,
  selected,
  onSelect,
  index = 0,
}: ChatTaskRowProps) {
```

Replace the `return (...)` statement (the `<Card ...>...</Card>` JSX) so the existing `Card` markup is assigned to a local `card` variable, then wrapped in `FloatingPanel` only when idle:

```tsx
  const card = (
    <Card
      aria-label={openAria}
      as="button"
      data-testid={ChatTaskRowTestId.Row}
      edge={tone}
      living={live}
      onClick={() => onSelect(run.runId)}
      selected={selected}
      tone={live ? tone : undefined}
    >
      <Container padding="150">
        <Stack gap="75">
          <Stack
            align="center"
            data-testid={ChatTaskRowTestId.Meta}
            direction="row"
            gap="75"
            justify="between"
          >
            <Stack align="center" direction="row" gap="75">
              <StatusDot pulse={live} size="75" tone={DOT_TONE_BY_STATE[tone]} />
              <Typography mono size="2xs" tone={tone} type="note">
                {run.owner}
              </Typography>
              <RunStateBadge canonTitle={run.status} label={stateLabel} status={run.status} />
            </Stack>
            <Typography mono size="2xs" type="note" variant="tertiary">
              {compactAgo(run.startedAt, renderedAt)}
            </Typography>
          </Stack>
          <Stack align="center" direction="row" gap="100">
            <IconTile alt="" glow={live} glyph={glyph} shape="circle" size="sm" src={avatar} />
            <Container grow minW0>
              <Typography mono truncate type="note" weight="bold">
                {title}
              </Typography>
            </Container>
          </Stack>
          <Stack align="center" direction="row" gap="75">
            <Icon name={live ? "pulse" : "run"} size="xs" tone={tone} />
            <Container grow minW0>
              <Typography mono truncate size="2xs" type="note" variant="tertiary">
                {run.owner} · {phase}
              </Typography>
            </Container>
          </Stack>
          {pct != null && (
            <Stack
              align="center"
              data-testid={ChatTaskRowTestId.Progress}
              direction="row"
              gap="100"
            >
              <Container grow>
                <Progress tone={tone} value={pct} />
              </Container>
              <Typography mono size="2xs" tone={tone} type="note">
                {pct}%
              </Typography>
            </Stack>
          )}
        </Stack>
      </Container>
    </Card>
  );

  return live ? card : <FloatingPanel index={index}>{card}</FloatingPanel>;
```

(This is a pure reshuffle of the existing JSX into a `card` variable plus a two-line wrap — no visual content inside `Card` changes.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `rtk vitest run apps/web/features/chat/components/ChatTaskRow.test.tsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Lint and typecheck**

Run: `pnpm check:lint && pnpm check:types`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/web/features/chat/components/ChatTaskRow.tsx apps/web/features/chat/components/ChatTaskRow.test.tsx
rtk git commit -m "feat(chat): idle task rows float via FloatingPanel"
```

---

### Task 3: Thread list position from `ChatTasksPanel` into `ChatTaskRow`

**Files:**
- Modify: `apps/web/features/chat/components/ChatTasksPanel.tsx`
- Modify: `apps/web/features/chat/components/ChatTasksPanel.test.tsx`

**Interfaces:**
- Consumes: `ChatTaskRowProps.index?: number` (Task 2), `FloatingPanelTestId.Root` from `@zibby/design-system` (Task 1).

- [ ] **Step 1: Write the failing test**

In `apps/web/features/chat/components/ChatTasksPanel.test.tsx`, add `FloatingPanelTestId` to the imports (it's a named export of `@zibby/design-system`):

```tsx
import { renderWithProviders as render, screen, within } from "../../../test/render";
import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FloatingPanelTestId } from "@zibby/design-system";
import type { RunView } from "../../runs/run";
import { ChatTaskRowTestId } from "./ChatTaskRow";
import { ChatTasksPanel, ChatTasksPanelTestId } from "./ChatTasksPanel";
```

Add a new `it` block inside the top-level `describe("ChatTasksPanel ...")`, alongside the other tests (e.g. right after the "orders live tasks..." test):

```tsx
  it("staggers idle rows' float animation by their position in the active list", () => {
    runsMock.mockReturnValue({
      runs: [
        run({ runId: "run_a", title: "Scheduled A", status: "scheduled" }),
        run({ runId: "run_b", title: "Scheduled B", status: "scheduled" }),
      ],
    });
    render(<ChatTasksPanel onSelectRun={vi.fn()} selectedRunId={null} />);

    const panels = screen.getAllByTestId(FloatingPanelTestId.Root);
    expect(panels).toHaveLength(2);
    expect(panels[0]?.style.animationDelay).not.toBe(panels[1]?.style.animationDelay);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run apps/web/features/chat/components/ChatTasksPanel.test.tsx`
Expected: FAIL — both idle rows currently default to `index = 0` inside `ChatTaskRow`, so both `FloatingPanel`s get the same `animationDelay` ("0s"), and the `not.toBe` assertion fails.

- [ ] **Step 3: Thread the index in `ChatTasksPanel.tsx`**

In `apps/web/features/chat/components/ChatTasksPanel.tsx`, change:

```tsx
  const renderRow = (r: (typeof runs)[number]) => (
    <ChatTaskRow
      avatar={runAvatar(r, avatarById)}
      glyph={runGlyph(r, glyphById)}
      key={r.runId}
      onSelect={onSelectRun}
      openAria={t("openAria", { title: runTitle(r) })}
      run={r}
      selected={selectedRunId === r.runId}
      stateLabel={tRuns(`state.${r.status}`)}
    />
  );
```

to:

```tsx
  const renderRow = (r: (typeof runs)[number], index: number) => (
    <ChatTaskRow
      avatar={runAvatar(r, avatarById)}
      glyph={runGlyph(r, glyphById)}
      index={index}
      key={r.runId}
      onSelect={onSelectRun}
      openAria={t("openAria", { title: runTitle(r) })}
      run={r}
      selected={selectedRunId === r.runId}
      stateLabel={tRuns(`state.${r.status}`)}
    />
  );
```

(`active.map(renderRow)` and `archived.map(renderRow)` already pass the array index as `Array.prototype.map`'s second callback argument — no call-site change needed.)

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk vitest run apps/web/features/chat/components/ChatTasksPanel.test.tsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Full verification sweep**

Run: `pnpm check:lint && pnpm check:types && pnpm test`
Expected: all green, no regressions anywhere in the workspace.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/web/features/chat/components/ChatTasksPanel.tsx apps/web/features/chat/components/ChatTasksPanel.test.tsx
rtk git commit -m "feat(chat): stagger task-list float by row position"
```

---

### Task 4: Live-browser verification

**Files:** none (manual verification only).

- [ ] **Step 1: Start the dev server**

Run: `pnpm web:dev`

- [ ] **Step 2: Open `/chat` and observe the left tasklist**

Confirm:
- Idle (non-running, non-awaiting-approval) task cards drift up/down a few pixels, each on its own timing — no visible synchronized wave.
- A running or awaiting-approval card does **not** float — its edge/glow "breathing" is unaffected and unchanged from before this change.
- Hovering, clicking, and selecting a card still works exactly as before (the `FloatingPanel` wrapper is a transparent transform host — it must not intercept or alter clicks).

- [ ] **Step 3: Verify reduced motion**

In Chrome DevTools → Rendering tab → "Emulate CSS media feature prefers-reduced-motion: reduce", reload `/chat`. Confirm idle cards no longer drift (frozen in place), while the rest of the UI otherwise looks the same.

- [ ] **Step 4: Report findings**

If anything above doesn't hold, note exactly what's wrong (which step, what was observed vs. expected) before considering this plan complete.

---

## Self-Review

**Spec coverage:**
- New `FloatingPanel` DS primitive (children + index, `w-full` transform host, no bg/border/radius) → Task 1.
- `ztFloat` keyframe (translateY only, ±3px) + `--animate-zt-float` token, `zt-` naming convention → Task 1, Step 3.
- Reduced motion via `motion-reduce:animate-none` (no new global switch file) → Task 1, Step 4; verified live in Task 4, Step 3.
- Storybook story + DS test trio → Task 1, Steps 5–6.
- `ChatTaskRow` wraps idle-only, `live` is the existing local check, no duplication in `ChatTasksPanel` → Task 2.
- `ChatTasksPanel` threads list-position `index` through `renderRow` → Task 3.
- Testing section (FloatingPanel test, ChatTaskRow idle-vs-live test, no unplanned ChatTasksPanel behavior change beyond index threading) → Tasks 1–3.
- Verification section (lint/types/test, live-browser check with reduced-motion toggle) → Task 3 Step 5, Task 4.

No gaps found.

**Placeholder scan:** none found — every step has complete code, exact file paths, and exact commands.

**Type consistency:** `FloatingPanelProps.index?: number` (Task 1) matches `<FloatingPanel index={index}>` call sites in Task 2 and the formula re-used in tests; `ChatTaskRowProps.index?: number` (Task 2) matches `<ChatTaskRow index={index} .../>` in Task 3; `FloatingPanelTestId.Root` name is identical across Task 1's component, Task 2's and Task 3's tests.
