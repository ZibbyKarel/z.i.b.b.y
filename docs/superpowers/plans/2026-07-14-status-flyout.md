# Status-Pill Hover Flyout (Velín-D phase 3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hovering the `/chat` status pill's "N pracují" segment opens a portalled "Pracují" panel (live runs, 2-col, width 640); hovering "N čekají na tebe" opens "Čeká na tvé rozhodnutí" (pending approvals with approve/reject, 2-col, width 720). Reports section OMITTED per operator. Park at the PR gate.

**Spec:** `docs/superpowers/specs/2026-07-14-status-flyout-design.md` (the authority for every contract below). Design extraction: `.superpowers/sdd3/design-flyout.md`. Ledger: `.superpowers/sdd3/progress.md`.

**Architecture:** Everything is app-local in `apps/web/features/chat/` (spec §2 — no new DS primitive). A pure hover state machine (`useStatusFlyout`, 200ms shared close grace) drives a `StatusFlyoutPanel` portalled to `document.body` (Dropdown's portal pattern; the /chat z-ladder + Phase-99 stacking trap forbid in-tree nesting). The panel is a SOLID surface (`--color-elevated` + `--color-border-strong` + section-accent ring) — NOT glass. Section bodies read the SSE-wired `useRunsQuery` / `useApprovalsQuery` through the shared `Collection` (honest loading → error → empty → grid). Waiting rows wire `useApproveMutation` / `useRejectMutation` directly.

**Tech Stack:** Next.js 15 App Router, React 19 (ref-as-prop, no `forwardRef`), TypeScript strict, Tailwind v4, `@zibby/design-system`, `@zibby/contracts`, TanStack Query, next-intl, Vitest, pnpm + rtk.

## Global Constraints

- **GATE-BUG law (66af534a), verbatim from the ledger:** *reject must call useRejectMutation directly — never a generic remove/dismiss/delete callback.* (A reject button was once wired to a generic `onDelete` that deleted the whole run + artifacts.) Every reject control in this feature calls `reject.mutate({ params: { id }, body: {} })` and nothing else; a unit test guards it.
- **Approval wiring:** approve = `useApproveMutation`, reject = `useRejectMutation` (import from the `features/approvals` barrel), call shape `mutate({ params: { id: approval.id }, body: {} })`. `HIGH_RISK_TYPES` (`platba`/`mazani`) approve goes through `HoldButton`; reject is **never** hold-gated.
- **Panel surface is SOLID** (spec §5): `var(--color-elevated)` bg, `var(--color-border-strong)` border, `var(--radius-lg)`, `boxShadow = <section ring> + var(--shadow-modal)`. Not `GlassSurface`.
- **Timings (spec §6.1):** instant open on segment hover, instant section-swap with NO re-animation, shared `CLOSE_GRACE_MS = 200` close grace across pill+panel, scale-in `scale(0.08)→scale(1)` `.32s cubic-bezier(.2,.8,.2,1)` + opacity `.2s ease` from the hovered segment, panel fixed at `left = pillCenter − width/2`, `top = pillBottom + 10`, `zIndex 60`, `maxHeight 76vh`.
- **English-only identifiers/comments — including test fixtures/literals.** No "velin"/Czech in source outside the i18n catalogs. Every user-visible string via next-intl.
- **i18n catalog edits land ONLY in Task 6.** Tasks 2–5 must not touch `cs.json`/`en.json`. New `chat.statusPill.flyout.*` keys render as their key path in component tests until Task 6 (next-intl missing-key fallback) — tests assert testids, never the new copy. Row controls reuse the existing `approval.*` namespace (do NOT mint a third approvals namespace).
- **No inline `style={{}}` on a raw DOM node in `apps/web`** (`react/forbid-dom-props`). Dynamic positioning/surface values go through the DS `Container`'s `style` passthrough (the sanctioned channel); the mount-only scale animation is imperative ref style mutation (Dropdown-style), not a JSX `style` prop. Raw `<button>` triggers use Tailwind classes only.
- **Known DS traps:** `HoldButton` does NOT forward `data-testid` (select via `HoldButtonTestId.Root`); `runStateTone()` returns `StateTone | undefined` (prefer `RUN_STATE[status].dot/.pulse` here); `DotTone` has `"wait"` not `"warn"` while `TypographyTone` has `"warn"` not `"wait"` (hence `SECTION_META.dotTone` vs `.titleTone`); `Collection` defaults `lg={3}` — pass `lg={2}`; `EmptyState` has no testid (assert empties by absent row testids).
- **Repo laws:** pnpm + `rtk` prefix (even in `&&` chains) — EXCEPT vitest, which must not go through rtk (`pnpm exec vitest run …`); React 19 no `forwardRef`; no `any`; TestId enums + `getByTestId` (roles/ARIA as assertions only); never `--no-verify`; don't kill the `:3000` dev server; don't commit `.zibby/data/system-config.json`.
- **Gates after any codegen, in order:** `rtk pnpm check:lint` → `rtk pnpm check:types` **and** `pnpm exec tsc -p apps/web --noEmit` (base config misses `apps/web`) → `pnpm test`. Fix all before moving on.
- **PARK at the PR gate:** commit on `feat/status-flyout`; never push, never open a PR without explicit operator instruction. The self-knowledge pre-commit hook may abort a commit and leave files staged → run `pnpm self-knowledge:generate`, verify the staged set, retry.
- **Data reality (do not invent):** a `RunView` has no subsystem id (work-row dot = run state, not subsystem hue); there is no run-level "report" status (reports section omitted); flyout section counts come from runs/approvals rows and may differ from the pill's subsystem counts — accepted, truthful.

---

## Task sequencing & parallelism

| # | Task | Depends on | Wave |
|---|---|---|---|
| 1 | Foundation: `statusFlyout.ts` + `useStatusFlyout` | — | sequential (commits) |
| 2 | `FlyoutWorkRow` | 1 | **Wave A — parallel, NO commit** |
| 3 | `FlyoutApprovalRow` | 1 | **Wave A — parallel, NO commit** |
| 4 | `StatusFlyoutPanel` (commits Wave A first) | 1, 2, 3 | sequential (commits) |
| 5 | `StatusPill` trigger integration | 1, 4 | sequential (commits) |
| 6 | i18n catalogs + parity (ONLY catalog task) | 2–5 | sequential (commits) |
| 7 | Final gates + live `:3000` verify (PARK) | all | sequential |

Tasks 2 and 3 are parallel-safe: disjoint file sets (`FlyoutWorkRow.*` vs `FlyoutApprovalRow.*`),
both only *read* Task 1's module and existing feature modules, and neither touches the i18n
catalogs. They run as a no-commit wave; Task 4's first step commits their output in one commit
(avoids two workers committing concurrently on one branch). Everything else is strictly sequential.

---

### Task 1: Foundation — `statusFlyout.ts` constants + `useStatusFlyout` hook

**Files:**
- Create: `apps/web/features/chat/statusFlyout.ts`
- Create: `apps/web/features/chat/statusFlyout.test.ts`
- Create: `apps/web/features/chat/useStatusFlyout.ts`
- Create: `apps/web/features/chat/useStatusFlyout.test.tsx`

**Interfaces (produced, consumed by Tasks 2–5):**
```ts
export type FlyoutSection = "working" | "waiting";
export const CLOSE_GRACE_MS = 200;
export const WORKING_STATUSES: ReadonlySet<TaskRunStatus>; // running | pending
export interface FlyoutSectionMeta {
  width: number; dotTone: "run" | "wait"; titleTone: "run" | "warn";
  ringShadow: string; headerGradient: string;
}
export const SECTION_META: Record<FlyoutSection, FlyoutSectionMeta>;
export function formatRelativeTime(iso: string, locale: string, now?: Date): string;
export interface UseStatusFlyout {
  activeSection: FlyoutSection | null; open: boolean;
  openTo: (section: FlyoutSection) => void;
  scheduleClose: () => void; cancelClose: () => void; close: () => void;
}
export function useStatusFlyout(): UseStatusFlyout;
```

- [ ] **Step 1: Write the failing tests**

`apps/web/features/chat/statusFlyout.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { CLOSE_GRACE_MS, formatRelativeTime, SECTION_META, WORKING_STATUSES } from "./statusFlyout";

describe("statusFlyout constants", () => {
  it("keeps the design widths and the 200ms grace", () => {
    expect(SECTION_META.working.width).toBe(640);
    expect(SECTION_META.waiting.width).toBe(720);
    expect(CLOSE_GRACE_MS).toBe(200);
  });

  it("counts running and spawning-pending runs as working", () => {
    expect(WORKING_STATUSES.has("running")).toBe(true);
    expect(WORKING_STATUSES.has("pending")).toBe(true);
    expect(WORKING_STATUSES.has("awaiting-approval")).toBe(false);
    expect(WORKING_STATUSES.has("done")).toBe(false);
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-07-14T12:00:00Z");

  it("formats a recent start relative to now", () => {
    expect(formatRelativeTime("2026-07-14T11:57:00Z", "en", now)).toBe("3 minutes ago");
  });

  it("degrades to an empty string on an unparsable date", () => {
    expect(formatRelativeTime("not-a-date", "en", now)).toBe("");
  });
});
```

`apps/web/features/chat/useStatusFlyout.test.tsx`:
```tsx
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOSE_GRACE_MS } from "./statusFlyout";
import { useStatusFlyout } from "./useStatusFlyout";

describe("useStatusFlyout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("opens instantly and swaps sections instantly", () => {
    const { result } = renderHook(() => useStatusFlyout());
    expect(result.current.open).toBe(false);
    act(() => result.current.openTo("working"));
    expect(result.current.activeSection).toBe("working");
    act(() => result.current.openTo("waiting"));
    expect(result.current.activeSection).toBe("waiting");
  });

  it("closes only after the full 200ms grace", () => {
    const { result } = renderHook(() => useStatusFlyout());
    act(() => result.current.openTo("working"));
    act(() => result.current.scheduleClose());
    act(() => vi.advanceTimersByTime(CLOSE_GRACE_MS - 1));
    expect(result.current.open).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.open).toBe(false);
  });

  it("cancelClose and openTo both abort a pending close", () => {
    const { result } = renderHook(() => useStatusFlyout());
    act(() => result.current.openTo("working"));
    act(() => result.current.scheduleClose());
    act(() => result.current.cancelClose());
    act(() => vi.advanceTimersByTime(CLOSE_GRACE_MS * 2));
    expect(result.current.open).toBe(true);

    act(() => result.current.scheduleClose());
    act(() => result.current.openTo("waiting"));
    act(() => vi.advanceTimersByTime(CLOSE_GRACE_MS * 2));
    expect(result.current.activeSection).toBe("waiting");
  });

  it("close() is immediate and clears any pending timer", () => {
    const { result } = renderHook(() => useStatusFlyout());
    act(() => result.current.openTo("waiting"));
    act(() => result.current.scheduleClose());
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
    act(() => vi.advanceTimersByTime(CLOSE_GRACE_MS * 2));
    expect(result.current.open).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run apps/web/features/chat/statusFlyout.test.ts apps/web/features/chat/useStatusFlyout.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `statusFlyout.ts`**

```ts
import type { TaskRunStatus } from "@zibby/contracts";

/** Which flyout section is open. Reports are OMITTED this phase (operator decision). */
export type FlyoutSection = "working" | "waiting";

/** Shared close grace: leaving BOTH the pill and the panel for this long closes. */
export const CLOSE_GRACE_MS = 200;

/**
 * Runs the "Pracují" section lists: actively running plus the spawning `pending`
 * (which "reads as live (pulses)" per RUN_STATE). Deliberately narrower than
 * RUN_STATUS_GROUPS.running — that bucket exists for feed filters, not liveness.
 */
export const WORKING_STATUSES: ReadonlySet<TaskRunStatus> = new Set(["running", "pending"]);

export interface FlyoutSectionMeta {
  /** Panel width in px (design: work 640, wait 720). */
  width: number;
  /** Header dot tone — DS DotTone vocabulary ("wait", not "warn"). */
  dotTone: "run" | "wait";
  /** Header title tone — DS TypographyTone vocabulary ("warn", not "wait"). */
  titleTone: "run" | "warn";
  /** 1px section-accent ring (design `0 0 0 1px ${color}22`) — the one visual value
   * with no DS token (no "state hue at 13% alpha" scale exists); composed with
   * var(--shadow-modal) by the panel. */
  ringShadow: string;
  /** Header wash (design `linear-gradient(180deg, ${color}14, transparent)`). */
  headerGradient: string;
}

export const SECTION_META: Record<FlyoutSection, FlyoutSectionMeta> = {
  working: {
    width: 640,
    dotTone: "run",
    titleTone: "run",
    ringShadow: "0 0 0 1px rgba(122,165,248,0.13)",
    headerGradient: "linear-gradient(180deg, rgba(122,165,248,0.08), transparent)",
  },
  waiting: {
    width: 720,
    dotTone: "wait",
    titleTone: "warn",
    ringShadow: "0 0 0 1px rgba(240,180,41,0.13)",
    headerGradient: "linear-gradient(180deg, rgba(240,180,41,0.08), transparent)",
  },
};

const DIVISIONS: ReadonlyArray<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: "seconds" },
  { amount: 60, unit: "minutes" },
  { amount: 24, unit: "hours" },
  { amount: 7, unit: "days" },
];

/**
 * Localized relative timestamp for flyout rows ("3 minutes ago" / "před 3 minutami").
 * The panel is transient (re-opened fresh on each hover), so a static value at
 * render time is honest — no ticking interval needed.
 */
export function formatRelativeTime(iso: string, locale: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  let duration = (then - now.getTime()) / 1000;
  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) return rtf.format(Math.round(duration), division.unit);
    duration /= division.amount;
  }
  return rtf.format(Math.round(duration), "weeks");
}
```

- [ ] **Step 4: Implement `useStatusFlyout.ts`**

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CLOSE_GRACE_MS, type FlyoutSection } from "./statusFlyout";

export interface UseStatusFlyout {
  /** The open section, or null when closed. */
  activeSection: FlyoutSection | null;
  open: boolean;
  /** Open (or swap to) a section immediately; cancels any pending close. */
  openTo: (section: FlyoutSection) => void;
  /** Arm the shared 200ms close grace (mouse/focus left pill OR panel). */
  scheduleClose: () => void;
  /** Cancel a pending close (mouse/focus entered pill OR panel). */
  cancelClose: () => void;
  /** Close now (Escape). */
  close: () => void;
}

/**
 * The flyout's hover/keyboard state machine (design VcStatusLineD): instant open,
 * instant section-swap, one shared close timer across pill + panel so moving the
 * pointer between them never closes — only leaving both for CLOSE_GRACE_MS does.
 */
export function useStatusFlyout(): UseStatusFlyout {
  const [activeSection, setActiveSection] = useState<FlyoutSection | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current != null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const openTo = useCallback(
    (section: FlyoutSection) => {
      cancelClose();
      setActiveSection(section);
    },
    [cancelClose],
  );

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setActiveSection(null), CLOSE_GRACE_MS);
  }, [cancelClose]);

  const close = useCallback(() => {
    cancelClose();
    setActiveSection(null);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  return { activeSection, open: activeSection != null, openTo, scheduleClose, cancelClose, close };
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm exec vitest run apps/web/features/chat/statusFlyout.test.ts apps/web/features/chat/useStatusFlyout.test.tsx`
Expected: PASS. (If the `formatRelativeTime` "3 minutes ago" literal differs in the environment's ICU, pin the assertion to the actual `en` output — adjust the expected string, not the function.)

- [ ] **Step 6: Gates**

Run: `rtk pnpm check:lint && rtk pnpm check:types && pnpm exec tsc -p apps/web --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
rtk git add apps/web/features/chat && rtk git commit -m "feat(chat): status-flyout foundation — section constants + hover state machine"
```

---

### Task 2: `FlyoutWorkRow` (Wave A — parallel with Task 3, NO commit)

**Files:**
- Create: `apps/web/features/chat/components/FlyoutWorkRow.tsx`
- Create: `apps/web/features/chat/components/FlyoutWorkRow.test.tsx`
- Reuse (no change): `apps/web/features/runs/run.ts` (`RUN_STATE`, `runTitle`, `RunView`), Task 1's `formatRelativeTime`

**Interfaces (produced, consumed by Task 4):** `FlyoutWorkRow`, `FlyoutWorkRowProps { run: RunView; glyph: IconName }`, `FlyoutWorkRowTestId`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from "vitest";
import type { RunView } from "../../runs/run";
import { renderWithProviders, screen } from "../../../test/render";
import { FlyoutWorkRow, FlyoutWorkRowTestId } from "./FlyoutWorkRow";

function run(overrides: Partial<RunView> = {}): RunView {
  const base: RunView = {
    runId: "r_1",
    kind: "agent",
    owner: "writer",
    status: "running",
    pct: null,
    title: "Fix login bug",
    prompt: "",
    project: "acme",
    startedAt: new Date().toISOString(),
    logBase: "agents",
  };
  return { ...base, ...overrides };
}

describe("FlyoutWorkRow", () => {
  it("renders meta (owner + relative start) and the run title", () => {
    renderWithProviders(<FlyoutWorkRow glyph="bot" run={run()} />);
    expect(screen.getByTestId(FlyoutWorkRowTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(FlyoutWorkRowTestId.Meta)).toHaveTextContent("writer");
    expect(screen.getByTestId(FlyoutWorkRowTestId.Root)).toHaveTextContent("Fix login bug");
  });

  it("shows the pct suffix only when the run carries pct", () => {
    const { rerender } = renderWithProviders(<FlyoutWorkRow glyph="bot" run={run({ pct: 74 })} />);
    expect(screen.getByTestId(FlyoutWorkRowTestId.Progress)).toHaveTextContent("74%");
    rerender(<FlyoutWorkRow glyph="bot" run={run({ pct: null })} />);
    expect(screen.queryByTestId(FlyoutWorkRowTestId.Progress)).toBeNull();
  });
});
```
(If the `RunView` base fixture above misses a required contract field, extend the base — do not cast with `as`. `renderWithProviders` re-exports all of Testing Library.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run apps/web/features/chat/components/FlyoutWorkRow.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
"use client";

import {
  Card,
  Container,
  Icon,
  type IconName,
  Stack,
  StatusDot,
  Typography,
} from "@zibby/design-system";
import { useLocale } from "next-intl";
import { RUN_STATE, type RunView, runTitle } from "../../runs/run";
import { formatRelativeTime } from "../statusFlyout";

export enum FlyoutWorkRowTestId {
  Root = "chat-flyout-work-row",
  Meta = "chat-flyout-work-row-meta",
  Progress = "chat-flyout-work-row-progress",
}

export interface FlyoutWorkRowProps {
  run: RunView;
  /** Owner glyph resolved by the section (one useRunGlyphMap call, not per-row). */
  glyph: IconName;
}

/**
 * One live run in the flyout's working section (design VcWorkRow): a small bordered
 * card on the solid panel — state dot + owner + relative start, the task title, and
 * a mono work line (glyph + owner + optional pct). Non-navigating this phase (the
 * prototype's onOpenSys has no real target). Dot/pulse come from RUN_STATE (exhaustive
 * per-status map) — a RunView has no subsystem hue.
 */
export function FlyoutWorkRow({ run, glyph }: FlyoutWorkRowProps) {
  const locale = useLocale();
  const state = RUN_STATE[run.status];

  return (
    <Card background="background" data-testid={FlyoutWorkRowTestId.Root}>
      <Container padding="150">
        <Stack gap="100">
          <Stack
            align="center"
            data-testid={FlyoutWorkRowTestId.Meta}
            direction="row"
            gap="100"
            justify="between"
          >
            <Stack align="center" direction="row" gap="100">
              <StatusDot pulse={state.pulse} tone={state.dot} />
              <Typography
                mono
                uppercase
                size="xs"
                tracking="wide"
                type="note"
                variant="tertiary"
                weight="semibold"
              >
                {run.owner}
              </Typography>
            </Stack>
            <Typography mono size="xs" type="note" variant="tertiary">
              {formatRelativeTime(run.startedAt, locale)}
            </Typography>
          </Stack>

          <Typography truncate size="sm" type="note" weight="semibold">
            {runTitle(run)}
          </Typography>

          <Stack align="center" direction="row" gap="50">
            <Icon name={glyph} size="sm" />
            <Typography mono size="xs" tone="run" type="note">
              {run.owner}
              {run.pct != null && (
                <Typography
                  as="span"
                  data-testid={FlyoutWorkRowTestId.Progress}
                  mono
                  size="xs"
                  tone="run"
                  type="note"
                >
                  {` · ${run.pct}%`}
                </Typography>
              )}
            </Typography>
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}
```
Adapt `Icon`'s `size` prop to its actual signature if `"sm"` is not a member (read it; do not guess). Everything else above is written against verified APIs (`Card background="background"`, `Typography truncate/tone="run"`, `Stack justify="between"`, `Container padding`, Spacing `"50"`).

- [ ] **Step 4: Run test to verify pass**

Run: `pnpm exec vitest run apps/web/features/chat/components/FlyoutWorkRow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Gates (NO commit — Wave A; Task 4 commits)**

Run: `rtk pnpm check:lint && rtk pnpm check:types && pnpm exec tsc -p apps/web --noEmit`
Expected: clean.

---

### Task 3: `FlyoutApprovalRow` (Wave A — parallel with Task 2, NO commit)

**Files:**
- Create: `apps/web/features/chat/components/FlyoutApprovalRow.tsx`
- Create: `apps/web/features/chat/components/FlyoutApprovalRow.test.tsx`
- Reuse (no change): `apps/web/features/approvals/approval.ts` (`DashboardApproval`, `HIGH_RISK_TYPES`, `RiskType`), `apps/web/features/approvals/index.ts` barrel (mutations), DS `Alert`/`Button`/`Card`/`Container`/`HoldButton`/`Stack`/`StatusDot`/`Tag`/`Typography`/`riskIcon`

**Interfaces (produced, consumed by Task 4):** `FlyoutApprovalRow`, `FlyoutApprovalRowProps { approval: DashboardApproval }`, `FlyoutApprovalRowTestId`.

- [ ] **Step 1: Write the failing test (the GATE-BUG guard lives here)**

```tsx
import { HoldButtonTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardApproval } from "../../approvals/approval";
import { renderWithProviders, screen } from "../../../test/render";
import { FlyoutApprovalRow, FlyoutApprovalRowTestId } from "./FlyoutApprovalRow";

const approveMutate = vi.fn();
const rejectMutate = vi.fn();
vi.mock("../../approvals", () => ({
  useApproveMutation: () => ({ mutate: approveMutate, isPending: false }),
  useRejectMutation: () => ({ mutate: rejectMutate, isPending: false }),
}));

function approval(overrides: Partial<DashboardApproval> = {}): DashboardApproval {
  return {
    id: "app_1",
    runId: "run_1",
    kind: "agent",
    skill: "Herald",
    action: "send the weekly digest",
    detail: "3 recipients",
    risk: "medium",
    status: "pending",
    requestedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("FlyoutApprovalRow", () => {
  beforeEach(() => {
    approveMutate.mockClear();
    rejectMutate.mockClear();
  });

  it("GATE-BUG guard: reject calls the reject mutation directly with the exact shape", async () => {
    renderWithProviders(<FlyoutApprovalRow approval={approval()} />);
    await userEvent.click(screen.getByTestId(FlyoutApprovalRowTestId.Reject));
    expect(rejectMutate).toHaveBeenCalledWith({ params: { id: "app_1" }, body: {} });
    expect(approveMutate).not.toHaveBeenCalled();
  });

  it("approves a non-high-risk approval with one click", async () => {
    renderWithProviders(<FlyoutApprovalRow approval={approval({ riskType: "odeslani" })} />);
    await userEvent.click(screen.getByTestId(FlyoutApprovalRowTestId.Approve));
    expect(approveMutate).toHaveBeenCalledWith({ params: { id: "app_1" }, body: {} });
  });

  it("hold-gates approve (never reject) for high-risk types", () => {
    renderWithProviders(<FlyoutApprovalRow approval={approval({ riskType: "platba" })} />);
    // HoldButton does NOT forward data-testid — select its own root testid.
    expect(screen.getByTestId(HoldButtonTestId.Root)).toBeInTheDocument();
    expect(screen.queryByTestId(FlyoutApprovalRowTestId.Approve)).toBeNull();
    expect(screen.getByTestId(FlyoutApprovalRowTestId.Reject)).toBeInTheDocument();
  });

  it("replaces the controls with a terminal state after deciding", async () => {
    renderWithProviders(<FlyoutApprovalRow approval={approval()} />);
    await userEvent.click(screen.getByTestId(FlyoutApprovalRowTestId.Reject));
    expect(screen.queryByTestId(FlyoutApprovalRowTestId.Reject)).toBeNull();
  });
});
```
(`vi.mock("../../approvals", …)` targets the barrel the component imports mutations from; types come from `../../approvals/approval` directly, so the mock doesn't have to re-export them. If `HoldButtonTestId` is not exported from the DS barrel, export it there — the DS convention is every component exports its TestId enum.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run apps/web/features/chat/components/FlyoutApprovalRow.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
"use client";

import {
  Alert,
  Button,
  Card,
  Container,
  HoldButton,
  type RiskKind,
  Stack,
  StatusDot,
  Tag,
  Typography,
  riskIcon,
} from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useApproveMutation, useRejectMutation } from "../../approvals";
import { type DashboardApproval, HIGH_RISK_TYPES, type RiskType } from "../../approvals/approval";
import { formatRelativeTime } from "../statusFlyout";

export enum FlyoutApprovalRowTestId {
  Root = "chat-flyout-approval-row",
  Approve = "chat-flyout-approval-approve",
  Reject = "chat-flyout-approval-reject",
}

export interface FlyoutApprovalRowProps {
  approval: DashboardApproval;
}

/** Semantic risk type → DS risk kind (ApprovalCard's map, typed on RiskType). */
const RISK_KIND: Record<RiskType, RiskKind> = {
  platba: "payment",
  mazani: "deletion",
  push: "push",
  odeslani: "send",
};

/**
 * One pending approval in the flyout's waiting section (design VcApprovalRow) with
 * the real decision wiring the prototype lacks. High-risk approve (platba/mazani)
 * confirms via HoldButton; GATE-BUG law (66af534a): reject calls useRejectMutation
 * directly — never a generic remove/dismiss/delete callback.
 */
export function FlyoutApprovalRow({ approval }: FlyoutApprovalRowProps) {
  const t = useTranslations("approval");
  const locale = useLocale();
  const approve = useApproveMutation();
  const reject = useRejectMutation();
  const [done, setDone] = useState<"ok" | "no" | null>(null);

  const kind = approval.riskType ? RISK_KIND[approval.riskType] : undefined;
  const hold = approval.riskType != null && HIGH_RISK_TYPES.has(approval.riskType);

  const doApprove = () => {
    setDone("ok");
    approve.mutate({ params: { id: approval.id }, body: {} });
  };

  const doReject = () => {
    setDone("no");
    reject.mutate({ params: { id: approval.id }, body: {} });
  };

  return (
    <Card background="background" data-testid={FlyoutApprovalRowTestId.Root}>
      <Container padding="150">
        <Stack gap="100">
          <Stack align="center" direction="row" gap="100" justify="between">
            <Stack align="center" direction="row" gap="100">
              <StatusDot pulse={done == null} tone={done == null ? "wait" : "idle"} />
              <Typography
                mono
                uppercase
                size="xs"
                tracking="wide"
                type="note"
                variant="tertiary"
                weight="semibold"
              >
                {approval.skill}
              </Typography>
            </Stack>
            <Stack align="center" direction="row" gap="100">
              {kind && (
                <Tag icon={riskIcon[kind]} tone={kind}>
                  {t(`riskTag.${kind}`)}
                </Tag>
              )}
              <Typography mono size="xs" type="note" variant="tertiary">
                {formatRelativeTime(approval.requestedAt, locale)}
              </Typography>
            </Stack>
          </Stack>

          <Typography size="sm" type="note" weight="semibold">
            <Typography as="span" mono size="sm" tone="accent" type="note" weight="semibold">
              {approval.skill}
            </Typography>{" "}
            <Typography as="span" size="sm" type="note" variant="secondary" weight="normal">
              {t("wants")}
            </Typography>{" "}
            {approval.action}
          </Typography>
          <Typography size="sm" type="note" variant="secondary">
            {approval.detail}
          </Typography>

          {done ? (
            <Alert severity={done === "ok" ? "ok" : "error"}>
              {done === "ok" ? t("approved") : t("rejected")}
            </Alert>
          ) : (
            <Stack direction="row" gap="100">
              {hold ? (
                <HoldButton
                  block
                  armedLabel={t("holdArmed")}
                  doneLabel={t("holdDone")}
                  label={t("holdToApprove")}
                  onConfirm={doApprove}
                  tone={approval.riskType === "mazani" ? "bad" : "warn"}
                />
              ) : (
                <Button
                  data-testid={FlyoutApprovalRowTestId.Approve}
                  disabled={reject.isPending}
                  icon="check"
                  intent="primary"
                  loading={approve.isPending}
                  onClick={doApprove}
                  tone="ok"
                >
                  {t("approve")}
                </Button>
              )}
              <Button
                data-testid={FlyoutApprovalRowTestId.Reject}
                disabled={approve.isPending}
                icon="x"
                intent="ghost"
                loading={reject.isPending}
                onClick={doReject}
              >
                {t("reject")}
              </Button>
            </Stack>
          )}
        </Stack>
      </Container>
    </Card>
  );
}
```
`Button`'s `loading`/`disabled`/`intent`/`tone`/`icon` and `HoldButton`'s prop set match `RunApprovalGate`/`ApprovalCard` verbatim — if a prop name drifts, mirror those two files, not memory.

- [ ] **Step 4: Run test to verify pass**

Run: `pnpm exec vitest run apps/web/features/chat/components/FlyoutApprovalRow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Gates (NO commit — Wave A; Task 4 commits)**

Run: `rtk pnpm check:lint && rtk pnpm check:types && pnpm exec tsc -p apps/web --noEmit`
Expected: clean.

---

### Task 4: `StatusFlyoutPanel` — portal shell, positioning, animation, sections

**Files:**
- Create: `apps/web/features/chat/components/StatusFlyoutPanel.tsx`
- Create: `apps/web/features/chat/components/StatusFlyoutPanel.test.tsx`
- Reuse (no change): Tasks 1–3 outputs; `apps/web/components/Collection/Collection.tsx`; `apps/web/features/approvals` barrel (`useApprovalsQuery`); `apps/web/features/runs/queries/useRunsQuery.ts` (`useRunsQuery`, `useRunGlyphMap`); `apps/web/features/runs/run.ts` (`runGlyph`)

**Interfaces (produced, consumed by Task 5):**
```ts
export const STATUS_FLYOUT_PANEL_ID = "chat-status-flyout-panel";
export interface StatusFlyoutPanelProps {
  section: FlyoutSection;
  anchorRect: DOMRect | null;   // pill root rect — panel centers under it
  originRect: DOMRect | null;   // hovered segment rect — scale-in origin
  onMouseEnter: () => void;     // cancelClose bridge
  onMouseLeave: () => void;     // scheduleClose bridge
  onRequestClose: () => void;   // Escape → close + restore trigger focus
}
export enum StatusFlyoutTestId { Root = "chat-status-flyout", Header = "chat-status-flyout-header", Body = "chat-status-flyout-body" }
```

- [ ] **Step 0: Commit Wave A output (Tasks 2 + 3)**

```bash
rtk git add apps/web/features/chat/components && rtk git commit -m "feat(chat): flyout work + approval rows (GATE-BUG-guarded reject wiring)"
```

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from "vitest";
import type { DashboardApproval } from "../../approvals/approval";
import type { RunView } from "../../runs/run";
import { renderWithProviders, screen } from "../../../test/render";
import { FlyoutApprovalRowTestId } from "./FlyoutApprovalRow";
import { FlyoutWorkRowTestId } from "./FlyoutWorkRow";
import { StatusFlyoutPanel, StatusFlyoutTestId } from "./StatusFlyoutPanel";

const runsState = {
  runs: [] as RunView[],
  isPending: false,
  isError: false,
  refetch: vi.fn(),
};
vi.mock("../../runs/queries/useRunsQuery", () => ({
  useRunsQuery: () => runsState,
  useRunGlyphMap: () => new Map(),
}));

const approvalsState = {
  data: [] as DashboardApproval[],
  isPending: false,
  isError: false,
  refetch: vi.fn(),
};
vi.mock("../../approvals", () => ({
  useApprovalsQuery: () => approvalsState,
  useApproveMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useRejectMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

function panelProps() {
  return {
    anchorRect: null,
    originRect: null,
    onMouseEnter: vi.fn(),
    onMouseLeave: vi.fn(),
    onRequestClose: vi.fn(),
  };
}

function makeRun(overrides: Partial<RunView> = {}): RunView {
  const base: RunView = {
    runId: "r_1",
    kind: "agent",
    owner: "writer",
    status: "running",
    pct: null,
    title: "Fix login bug",
    prompt: "",
    project: "acme",
    startedAt: new Date().toISOString(),
    logBase: "agents",
  };
  return { ...base, ...overrides };
}

describe("StatusFlyoutPanel", () => {
  it("is a labelled dialog portalled to document.body", () => {
    renderWithProviders(<StatusFlyoutPanel section="working" {...panelProps()} />);
    const root = screen.getByTestId(StatusFlyoutTestId.Root);
    expect(root).toHaveRole("dialog");
    expect(root).toHaveAttribute("aria-labelledby");
    expect(root.parentElement).toBe(document.body);
  });

  it("renders working rows for live runs only, and their count in the header", () => {
    runsState.runs = [
      makeRun({ runId: "r_1", status: "running" }),
      makeRun({ runId: "r_2", status: "pending" }),
      makeRun({ runId: "r_3", status: "done" }),
    ];
    renderWithProviders(<StatusFlyoutPanel section="working" {...panelProps()} />);
    expect(screen.getAllByTestId(FlyoutWorkRowTestId.Root)).toHaveLength(2);
    expect(screen.getByTestId(StatusFlyoutTestId.Header)).toHaveTextContent("2");
    runsState.runs = [];
  });

  it("renders an empty working body without rows when nothing is live", () => {
    renderWithProviders(<StatusFlyoutPanel section="working" {...panelProps()} />);
    expect(screen.queryByTestId(FlyoutWorkRowTestId.Root)).toBeNull();
    expect(screen.getByTestId(StatusFlyoutTestId.Body)).toBeInTheDocument();
  });

  it("switches to approval rows for the waiting section", () => {
    approvalsState.data = [
      {
        id: "app_1",
        runId: "run_1",
        kind: "agent",
        skill: "Herald",
        action: "send the digest",
        detail: "3 recipients",
        risk: "medium",
        status: "pending",
        requestedAt: new Date().toISOString(),
      },
    ];
    renderWithProviders(<StatusFlyoutPanel section="waiting" {...panelProps()} />);
    expect(screen.getByTestId(FlyoutApprovalRowTestId.Root)).toBeInTheDocument();
    expect(screen.queryByTestId(FlyoutWorkRowTestId.Root)).toBeNull();
    approvalsState.data = [];
  });

  it("shows the error state (never a fake empty) when the runs query fails", () => {
    runsState.isError = true;
    renderWithProviders(<StatusFlyoutPanel section="working" {...panelProps()} />);
    expect(screen.getByTestId("load-error-root")).toBeInTheDocument();
    runsState.isError = false;
  });
});
```
(Read `LoadErrorTestId.Root`'s actual value in `apps/web/components/LoadError/LoadError.tsx` and import the enum instead of the `"load-error-root"` literal.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run apps/web/features/chat/components/StatusFlyoutPanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
"use client";

import { useEffect, useId, useRef } from "react";
import type { FocusEvent, KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Container, Stack, StatusDot, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { Collection } from "../../../components/Collection/Collection";
import { useApprovalsQuery } from "../../approvals";
import { useRunGlyphMap, useRunsQuery } from "../../runs/queries/useRunsQuery";
import { runGlyph } from "../../runs/run";
import { type FlyoutSection, SECTION_META, WORKING_STATUSES } from "../statusFlyout";
import { FlyoutApprovalRow } from "./FlyoutApprovalRow";
import { FlyoutWorkRow } from "./FlyoutWorkRow";

export enum StatusFlyoutTestId {
  Root = "chat-status-flyout",
  Header = "chat-status-flyout-header",
  Body = "chat-status-flyout-body",
}

/** Stable DOM id the pill triggers point aria-controls at (and move focus into). */
export const STATUS_FLYOUT_PANEL_ID = "chat-status-flyout-panel";

export interface StatusFlyoutPanelProps {
  section: FlyoutSection;
  /** Pill root rect — the panel is centered under the PILL, not the segment. */
  anchorRect: DOMRect | null;
  /** Hovered segment rect — the scale-in animation grows from it. */
  originRect: DOMRect | null;
  /** Hover bridge: entering the panel cancels the shared pending close. */
  onMouseEnter: () => void;
  /** Hover bridge: leaving the panel arms the shared 200ms close grace. */
  onMouseLeave: () => void;
  /** Escape inside the panel: close now + restore focus to the trigger. */
  onRequestClose: () => void;
}

function SectionHeader({
  count,
  headerId,
  section,
}: {
  count: number;
  headerId: string;
  section: FlyoutSection;
}) {
  const t = useTranslations("chat.statusPill.flyout");
  const meta = SECTION_META[section];
  return (
    <Container
      data-testid={StatusFlyoutTestId.Header}
      padding="150"
      style={{ background: meta.headerGradient, borderBottom: "1px solid var(--color-border)" }}
    >
      <Stack align="center" direction="row" gap="100" justify="between">
        <Stack align="center" direction="row" gap="100">
          <StatusDot pulse tone={meta.dotTone} />
          <Typography id={headerId} size="md" tone={meta.titleTone} type="note" weight="semibold">
            {t(`${section}.title`)}
          </Typography>
        </Stack>
        <Typography mono size="xs" type="note" variant="tertiary">
          {count}
        </Typography>
      </Stack>
    </Container>
  );
}

function WorkingSection({ headerId }: { headerId: string }) {
  const t = useTranslations("chat.statusPill.flyout");
  const { runs, isPending, isError, refetch } = useRunsQuery();
  const glyphById = useRunGlyphMap();
  const working = runs.filter((r) => WORKING_STATUSES.has(r.status));
  return (
    <>
      <SectionHeader count={working.length} headerId={headerId} section="working" />
      <Container data-testid={StatusFlyoutTestId.Body} padding="150">
        <Collection
          cols={1}
          empty={{
            glyph: "run",
            title: t("working.emptyTitle"),
            description: t("working.emptyBody"),
          }}
          error={
            isError
              ? {
                  title: t("errorTitle"),
                  description: t("errorBody"),
                  retryLabel: t("retry"),
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          gap="100"
          items={working}
          lg={2}
          loading={isPending ? { label: t("loading") } : undefined}
          renderItem={(run) => (
            <FlyoutWorkRow glyph={runGlyph(run, glyphById)} key={run.runId} run={run} />
          )}
          sm={2}
        />
      </Container>
    </>
  );
}

function WaitingSection({ headerId }: { headerId: string }) {
  const t = useTranslations("chat.statusPill.flyout");
  const query = useApprovalsQuery();
  const approvals = query.data ?? [];
  return (
    <>
      <SectionHeader count={approvals.length} headerId={headerId} section="waiting" />
      <Container data-testid={StatusFlyoutTestId.Body} padding="150">
        <Collection
          cols={1}
          empty={{
            glyph: "ok",
            title: t("waiting.emptyTitle"),
            description: t("waiting.emptyBody"),
          }}
          error={
            query.isError
              ? {
                  title: t("errorTitle"),
                  description: t("errorBody"),
                  retryLabel: t("retry"),
                  onRetry: () => void query.refetch(),
                }
              : undefined
          }
          gap="100"
          items={approvals}
          lg={2}
          loading={query.isPending ? { label: t("loading") } : undefined}
          renderItem={(approval) => <FlyoutApprovalRow approval={approval} key={approval.id} />}
          sm={2}
        />
      </Container>
    </>
  );
}

/**
 * The status-pill flyout (design VcStatusPanelD): a SOLID elevated panel (not glass)
 * portalled to document.body — the /chat z-ladder + Phase-99 stacking trap forbid
 * in-tree nesting (Dropdown's portal precedent). Fixed-positioned centered under the
 * pill; scale-in from the hovered segment on mount ONLY (a section swap re-renders
 * this mounted panel and must not re-animate — the prototype's wasOpenRef guard
 * becomes "effect runs once" because the panel fully unmounts when closed).
 */
export function StatusFlyoutPanel({
  section,
  anchorRect,
  originRect,
  onMouseEnter,
  onMouseLeave,
  onRequestClose,
}: StatusFlyoutPanelProps) {
  const headerId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const meta = SECTION_META[section];
  const left = anchorRect ? Math.round(anchorRect.left + anchorRect.width / 2 - meta.width / 2) : 0;
  const top = anchorRect ? Math.round(anchorRect.bottom + 10) : 0;

  useEffect(() => {
    const el = rootRef.current;
    if (el == null) return;
    const originXPct = originRect
      ? Math.min(100, Math.max(0, ((originRect.left + originRect.width / 2 - left) / meta.width) * 100))
      : 50;
    el.style.transformOrigin = `${originXPct}% 0%`;
    el.style.transition = "none";
    el.style.transform = "scale(0.08)";
    el.style.opacity = "0";
    el.getBoundingClientRect(); // flush styles so the transition below animates
    requestAnimationFrame(() => {
      el.style.transition = "transform .32s cubic-bezier(.2,.8,.2,1), opacity .2s ease";
      el.style.transform = "scale(1)";
      el.style.opacity = "1";
    });
    // Mount-only by design: swapping sections while open must not replay the scale-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onRequestClose();
    }
  };

  // Keyboard analogue of mouse-leave: focus moving somewhere that is neither this
  // panel nor the pill arms the shared close grace (the pill's trigger focus
  // handlers cancel it when focus lands back there).
  const onBlur = (e: FocusEvent<HTMLElement>) => {
    if (e.relatedTarget instanceof Node && rootRef.current?.contains(e.relatedTarget)) return;
    onMouseLeave();
  };

  return createPortal(
    <Container
      aria-labelledby={headerId}
      data-testid={StatusFlyoutTestId.Root}
      id={STATUS_FLYOUT_PANEL_ID}
      maxHeight="76vh"
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      overflowY="auto"
      position="fixed"
      ref={rootRef}
      role="dialog"
      style={{
        left,
        top,
        width: meta.width,
        background: "var(--color-elevated)",
        border: "1px solid var(--color-border-strong)",
        borderRadius: "var(--radius-lg)",
        boxShadow: `${meta.ringShadow}, var(--shadow-modal)`,
      }}
      tabIndex={-1}
      zIndex={60}
    >
      {section === "working" ? (
        <WorkingSection headerId={headerId} />
      ) : (
        <WaitingSection headerId={headerId} />
      )}
    </Container>,
    document.body,
  );
}
```
All geometry/surface values ride the DS `Container`'s `style` passthrough + layout props (`position`/`zIndex`/`maxHeight`/`overflowY`) — no raw-DOM inline style. The imperative animation mutates the ref's style (Dropdown-style measurement/imperative precedent), never a JSX `style` prop on a DOM node.

- [ ] **Step 4: Run test to verify pass**

Run: `pnpm exec vitest run apps/web/features/chat/components/StatusFlyoutPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Gates**

Run: `rtk pnpm check:lint && rtk pnpm check:types && pnpm exec tsc -p apps/web --noEmit && pnpm exec vitest run apps/web/features/chat/components`
Expected: clean + PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/web/features/chat && rtk git commit -m "feat(chat): status flyout panel — solid portalled surface with live sections"
```

---

### Task 5: `StatusPill` trigger integration

**Files:**
- Modify: `apps/web/features/chat/components/StatusPill.tsx`
- Modify: `apps/web/features/chat/components/StatusPill.test.tsx`
- Reuse (no change): Tasks 1 + 4 outputs

**Interfaces:** `StatusPillTestId` keeps its four members and values (test continuity); the `Working`/`Waiting` testids move from the `Typography` to the wrapping trigger `<button>` (textContent assertions keep passing — the Typography is inside).

- [ ] **Step 1: Extend the failing test**

Keep the two existing tests (counts + root) untouched. Mock the panel so the pill test doesn't drag the query graph in, and add:
```tsx
// Add to the existing vi.mock block set:
vi.mock("./StatusFlyoutPanel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./StatusFlyoutPanel")>();
  return {
    ...actual,
    StatusFlyoutPanel: ({ section }: { section: string }) => (
      <div data-testid="chat-status-flyout" id={actual.STATUS_FLYOUT_PANEL_ID}>{section}</div>
    ),
  };
});

// New tests:
it("exposes working and waiting segments as flyout trigger buttons; report stays plain", () => {
  renderWithProviders(<StatusPill />);
  const working = screen.getByTestId(StatusPillTestId.Working);
  expect(working.tagName).toBe("BUTTON");
  expect(working).toHaveAttribute("aria-haspopup", "dialog");
  expect(working).toHaveAttribute("aria-controls");
  expect(screen.getByTestId(StatusPillTestId.Waiting).tagName).toBe("BUTTON");
  expect(screen.getByTestId(StatusPillTestId.Report).tagName).not.toBe("BUTTON");
});

it("opens the section on trigger focus and closes on Escape without reopening", async () => {
  renderWithProviders(<StatusPill />);
  const working = screen.getByTestId(StatusPillTestId.Working);
  act(() => working.focus());
  expect(working).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByTestId("chat-status-flyout")).toHaveTextContent("working");
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByTestId("chat-status-flyout")).toBeNull();
  // Escape restored focus to the trigger; the restore must NOT re-open.
  expect(working).toHaveFocus();
  expect(working).toHaveAttribute("aria-expanded", "false");
});

it("swaps sections when the other trigger is hovered", async () => {
  renderWithProviders(<StatusPill />);
  await userEvent.hover(screen.getByTestId(StatusPillTestId.Working));
  expect(screen.getByTestId("chat-status-flyout")).toHaveTextContent("working");
  await userEvent.hover(screen.getByTestId(StatusPillTestId.Waiting));
  expect(screen.getByTestId("chat-status-flyout")).toHaveTextContent("waiting");
});
```
(Imports: add `act`, `userEvent`. If `userEvent.hover` doesn't fire `pointerenter` in the installed version, use `fireEvent.pointerEnter(...)` — adjust the event helper, not the component.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run apps/web/features/chat/components/StatusPill.test.tsx`
Expected: FAIL — segments are not buttons; no flyout mounts.

- [ ] **Step 3: Rebuild `StatusPill`**

```tsx
"use client";

import { useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, ReactNode } from "react";
import { Stack, StatusDot, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useSubsystemsQuery } from "../../subsystems/queries/useSubsystemsQuery";
import { type FlyoutSection } from "../statusFlyout";
import { useStatusFlyout } from "../useStatusFlyout";
import { STATUS_FLYOUT_PANEL_ID, StatusFlyoutPanel } from "./StatusFlyoutPanel";

export enum StatusPillTestId {
  Root = "chat-status-pill",
  Working = "chat-status-pill-working",
  Report = "chat-status-pill-report",
  Waiting = "chat-status-pill-waiting",
}

/** Per-section trigger chrome (design: hovered/active segment tints in its hue). */
const TRIGGER_CLASS: Record<FlyoutSection, string> = {
  working:
    "rounded-full px-2 py-0.5 transition-colors hover:bg-run/15 aria-expanded:bg-run/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-run",
  waiting:
    "rounded-full px-2 py-0.5 transition-colors hover:bg-warn/15 aria-expanded:bg-warn/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-warn",
};

/**
 * The top-bar live status pill — subsystem state counts, now also the flyout host
 * (Velín-D phase 3a): the working/waiting segments are hover+keyboard triggers for
 * the portalled StatusFlyoutPanel; the report segment stays a plain count (operator:
 * reports section omitted this phase). Raw <button> triggers are the sanctioned
 * bespoke-control pattern; Tailwind classes only, no inline style.
 */
export function StatusPill() {
  const t = useTranslations("chat");
  const { data } = useSubsystemsQuery();
  const subsystems = data ?? [];
  const flyout = useStatusFlyout();
  const rootRef = useRef<HTMLDivElement>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const suppressFocusOpenRef = useRef(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);

  const working = subsystems.filter((s) => s.state === "running").length;
  const report = subsystems.filter((s) => s.state === "report").length;
  const waiting = subsystems.filter((s) => s.state === "waiting").length;

  const openSection = (section: FlyoutSection, trigger: HTMLButtonElement) => {
    lastTriggerRef.current = trigger;
    setAnchorRect(rootRef.current?.getBoundingClientRect() ?? null);
    setOriginRect(trigger.getBoundingClientRect());
    flyout.openTo(section);
  };

  const closeAndRestoreFocus = () => {
    flyout.close();
    const trigger = lastTriggerRef.current;
    // .focus() fires the trigger's onFocus synchronously — without this one-shot
    // guard, Escape-close would instantly reopen the panel. Arm it ONLY when focus
    // actually moves: if the trigger already holds focus (Escape pressed on the
    // trigger itself) no focus event fires, and a stale flag would swallow the
    // next genuine focus-open.
    if (trigger != null && document.activeElement !== trigger) {
      suppressFocusOpenRef.current = true;
      trigger.focus();
    }
  };

  const onTriggerFocus = (section: FlyoutSection) => (e: FocusEvent<HTMLButtonElement>) => {
    if (suppressFocusOpenRef.current) {
      suppressFocusOpenRef.current = false;
      return;
    }
    openSection(section, e.currentTarget);
  };

  const onTriggerKeyDown = (section: FlyoutSection) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape") {
      closeAndRestoreFocus();
      return;
    }
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      openSection(section, e.currentTarget);
      // Move focus into the panel root (tabIndex=-1) once it has mounted.
      requestAnimationFrame(() => document.getElementById(STATUS_FLYOUT_PANEL_ID)?.focus());
    }
  };

  // Keyboard analogue of mouse-leave: focus left the pill entirely.
  const onRootBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (e.relatedTarget instanceof Node && rootRef.current?.contains(e.relatedTarget)) return;
    flyout.scheduleClose();
  };

  const trigger = (section: FlyoutSection, testId: string, label: ReactNode) => (
    <button
      aria-controls={STATUS_FLYOUT_PANEL_ID}
      aria-expanded={flyout.activeSection === section}
      aria-haspopup="dialog"
      className={TRIGGER_CLASS[section]}
      data-testid={testId}
      onFocus={onTriggerFocus(section)}
      onKeyDown={onTriggerKeyDown(section)}
      onPointerEnter={(e) => openSection(section, e.currentTarget)}
      type="button"
    >
      {label}
    </button>
  );

  return (
    <div
      className="rounded-full border border-border px-[14px] py-[6px]"
      data-testid={StatusPillTestId.Root}
      onBlur={onRootBlur}
      onMouseEnter={flyout.cancelClose}
      onMouseLeave={flyout.scheduleClose}
      ref={rootRef}
    >
      <Stack align="center" direction="row" gap="100">
        <StatusDot tone="ok" />
        <Typography mono size="xs" tracking="wide" type="note" variant="secondary">
          {t("statusPill.nominal")}
        </Typography>
        {working > 0 &&
          trigger(
            "working",
            StatusPillTestId.Working,
            <Typography mono size="xs" tracking="wide" type="note" variant="secondary">
              {t("statusPill.working", { n: working })}
            </Typography>,
          )}
        {report > 0 && (
          <Typography
            mono
            data-testid={StatusPillTestId.Report}
            size="xs"
            tone="warn"
            tracking="wide"
            type="note"
          >
            {t("statusPill.report", { n: report })}
          </Typography>
        )}
        {waiting > 0 &&
          trigger(
            "waiting",
            StatusPillTestId.Waiting,
            <Typography mono size="xs" tone="accent" tracking="wide" type="note">
              {t("statusPill.waiting", { n: waiting })}
            </Typography>,
          )}
      </Stack>
      {flyout.activeSection != null && (
        <StatusFlyoutPanel
          anchorRect={anchorRect}
          onMouseEnter={flyout.cancelClose}
          onMouseLeave={flyout.scheduleClose}
          onRequestClose={closeAndRestoreFocus}
          originRect={originRect}
          section={flyout.activeSection}
        />
      )}
    </div>
  );
}
```
Note the panel mounts inside the pill's JSX but *renders* via its own `createPortal` to `document.body` — the pill's `onMouseLeave` therefore does NOT cover the panel (it is not a DOM descendant); the panel's own `onMouseEnter`/`onMouseLeave` props carry the shared grace, exactly the prototype's wiring.

- [ ] **Step 4: Run test to verify pass**

Run: `pnpm exec vitest run apps/web/features/chat/components/StatusPill.test.tsx`
Expected: PASS (both preserved tests and the three new ones).

- [ ] **Step 5: Gates**

Run: `rtk pnpm check:lint && rtk pnpm check:types && pnpm exec tsc -p apps/web --noEmit && pnpm exec vitest run apps/web/features/chat`
Expected: clean + PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/web/features/chat && rtk git commit -m "feat(chat): status-pill segments trigger the hover flyout (keyboard-operable)"
```

---

### Task 6: i18n catalogs + parity (the ONLY task that edits cs.json/en.json)

**Files:**
- Modify: `apps/web/i18n/messages/cs.json`, `apps/web/i18n/messages/en.json`
- Modify: `apps/web/i18n/messages/parity.test.ts`

- [ ] **Step 1: Extend the failing parity test**

Add to the existing `describe` block:
```ts
it("has the status-flyout keys (phase 3a)", () => {
  for (const key of [
    "chat.statusPill.flyout.working.title",
    "chat.statusPill.flyout.working.emptyTitle",
    "chat.statusPill.flyout.working.emptyBody",
    "chat.statusPill.flyout.waiting.title",
    "chat.statusPill.flyout.waiting.emptyTitle",
    "chat.statusPill.flyout.waiting.emptyBody",
    "chat.statusPill.flyout.loading",
    "chat.statusPill.flyout.errorTitle",
    "chat.statusPill.flyout.errorBody",
    "chat.statusPill.flyout.retry",
    // reused by flyout rows — must keep existing:
    "approval.approve",
    "approval.reject",
    "approval.holdToApprove",
  ]) {
    expect(keys(en)).toContain(key);
    expect(keys(cs)).toContain(key);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run apps/web/i18n/messages/parity.test.ts`
Expected: FAIL — the `chat.statusPill.flyout.*` keys are missing.

- [ ] **Step 3: Add the keys to BOTH catalogs (spec §7 table, copy verbatim)**

Inside the existing `chat.statusPill` object add a `flyout` object (no dialog-label key: the
panel's accessible name is `aria-labelledby` → the section title, so every key below has a
consumer). `cs.json`:
```json
"flyout": {
  "working": {
    "title": "Pracují",
    "emptyTitle": "Nikdo nepracuje",
    "emptyBody": "Žádná úloha právě neběží."
  },
  "waiting": {
    "title": "Čeká na tvé rozhodnutí",
    "emptyTitle": "Nic nečeká",
    "emptyBody": "žádná akce nečeká · ZIBBY sám neobjedná"
  },
  "loading": "Načítám…",
  "errorTitle": "Nepodařilo se načíst",
  "errorBody": "Zkus to prosím znovu.",
  "retry": "Zkusit znovu"
}
```
`en.json`:
```json
"flyout": {
  "working": {
    "title": "Working",
    "emptyTitle": "Nothing running",
    "emptyBody": "No task is running right now."
  },
  "waiting": {
    "title": "Waiting for your decision",
    "emptyTitle": "Nothing waiting",
    "emptyBody": "nothing is waiting · ZIBBY never orders on its own"
  },
  "loading": "Loading…",
  "errorTitle": "Couldn't load",
  "errorBody": "Please try again.",
  "retry": "Retry"
}
```
Do NOT touch `approval.*` (reused verbatim by the flyout rows) or the existing `chat.statusPill.{nominal,working,report,waiting}` keys.

- [ ] **Step 4: Run parity + the flyout component tests to verify pass**

Run: `pnpm exec vitest run apps/web/i18n/messages/parity.test.ts apps/web/features/chat`
Expected: PASS — component tests assert testids, so real copy landing changes nothing.

- [ ] **Step 5: Gates**

Run: `rtk pnpm check:lint && rtk pnpm check:types && pnpm exec tsc -p apps/web --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/web/i18n && rtk git commit -m "chore(i18n): status-flyout cs/en keys + parity guard"
```

---

### Task 7: Final gates + live `:3000` verification (PARK)

**Files:** none (verification only; a follow-up fix commit if a live defect is found).

- [ ] **Step 1: Full gates**

Run: `rtk pnpm check:lint && rtk pnpm check:types && pnpm exec tsc -p apps/web --noEmit`
Expected: clean.

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: green, ignoring only the ledger's documented pre-existing flakes (`apps/api` runner-core, tasks.e2e, approvals.e2e, budget.e2e, agent-runs.e2e) — none of which this feature touches.

- [ ] **Step 3: Live `:3000` verification (mandatory — jsdom cannot see any of this)**

The dev server on `:3000` is typically already running and is NOT ours to restart — never kill it; only start `pnpm web:dev` if nothing is listening. Browser automation goes through `rtk proxy` (rtk mangles playwright output), and beware the `.playwright-mcp/` Fast-Refresh trap — take screenshots only after the page has settled, never mid-reload. Load `http://localhost:3000/chat` and verify:
- hovering "N pracují" opens the Pracují panel instantly; hovering "N čekají na tebe" swaps to Čeká na tvé rozhodnutí **without re-animating**; the report segment does nothing;
- the panel scales in from the hovered segment, sits centered under the pill (10px below), is SOLID (no backdrop blur/see-through), and stacks **over the orb map**;
- moving the pointer pill → panel does not close; leaving both closes after ~200ms;
- panel content scrolls within 76vh; widths read ~640 (working) / ~720 (waiting);
- **approve/reject click-through on a real pending approval if one exists** (check the waiting section; a `platba`/`mazani` one must show the hold-to-approve control) — the row flips to its terminal state and disappears on the next refetch; if no pending approval exists, verify the empty state copy ("žádná akce nečeká · ZIBBY sám neobjedná") and note the gap in the task log;
- keyboard pass: Tab reaches the working trigger → panel opens on focus → Enter moves focus into the panel → Tab reaches a reject button → Escape closes and returns focus to the trigger without reopening;
- cs ⇄ en switch shows the English section titles.
Capture one screenshot of the open waiting panel after first paint.

- [ ] **Step 4: Fix any live defect, re-run the affected gate, commit**

The likely live-only bug classes: a missing `"use client"`, `pointer-events` swallowed by the chat inner wrapper, portal z-fight with the drawer, `onPointerEnter` vs touch. Fix, re-run the relevant test/gate, then:
```bash
rtk git add apps/web && rtk git commit -m "fix(chat): live-verify corrections for status flyout"
```

- [ ] **Step 5: PARK at the PR gate**

Do **not** push and do **not** open a PR. Update `.superpowers/sdd3/progress.md` task log (completion + park + any live-pass notes) and report the final commit hash to the operator. If the self-knowledge pre-commit hook aborts any commit above: run `pnpm self-knowledge:generate`, verify the staged set (`rtk git status`), retry the commit. Never `--no-verify`.

---

## Self-Review

**1. Spec coverage** — Placement decision (spec §2, app-local, no DS primitive) → the plan creates files only under `apps/web/features/chat/`. Data flow (§3: `WORKING_STATUSES`, SSE-wired queries, count semantics) → Tasks 1 + 4. Component contracts (§4.1–4.5: every interface/TestId enum) → Tasks 1/2/3/4/5 reproduce them verbatim, including the HoldButton-testid caveat (§4.4) and the trigger ARIA set (§4.5). Visual contract (§5: solid surface tokens, SECTION_META with split dotTone/titleTone, ring-shadow flag, mount-only animation math) → Task 4's implementation carries the exact values and the `Container` style-passthrough channel. Interaction contract (§6.1 timings → Task 1 hook + Task 5 wiring; §6.2 keyboard incl. the suppress-focus-reopen guard → Task 5). i18n table (§7) → Task 6, sole catalog toucher, `approval.*` reused not duplicated. Load states (§8: Collection with `lg={2}`) → Task 4. Testing strategy (§9 jsdom-vs-live split) → unit tests in Tasks 1–5, live checklist in Task 7. Acceptance criteria (§10) map 1:1 onto Task 7's checklist + gates. No spec section is unassigned.

**2. Placeholder scan** — No "TBD"/"similar to"/"add later". Every implementation step contains the complete file body; every test step contains runnable code plus the exact command and expected outcome. The three deliberate adapt-notes (Icon `size` member in Task 2, `LoadErrorTestId` import in Task 4, `userEvent.hover` pointer-event fallback in Task 5) each name the exact file to read and constrain the fix to the test/prop, not the contract.

**3. Type consistency across tasks** — `FlyoutSection`/`CLOSE_GRACE_MS`/`SECTION_META`/`WORKING_STATUSES`/`formatRelativeTime(iso, locale, now?)` are declared once in Task 1 and imported by name in Tasks 2–5. `FlyoutWorkRowProps { run: RunView; glyph: IconName }` (Task 2) matches Task 4's `renderItem` call (`glyph={runGlyph(run, glyphById)}`). `FlyoutApprovalRowProps { approval: DashboardApproval }` (Task 3) matches Task 4's waiting `renderItem`. `StatusFlyoutPanelProps`/`STATUS_FLYOUT_PANEL_ID`/`StatusFlyoutTestId` (Task 4) match Task 5's usage (`anchorRect`/`originRect`/`onMouseEnter`/`onMouseLeave`/`onRequestClose`/`section`, `aria-controls={STATUS_FLYOUT_PANEL_ID}`). The mutation call shape `{ params: { id }, body: {} }` is identical in Task 3's implementation, its GATE-BUG test assertion, and the Global Constraints. `SECTION_META.dotTone` feeds `StatusDot` and `.titleTone` feeds `Typography` — never crossed (the DotTone-"wait"/TypographyTone-"warn" split is stated in Task 1's code, the constraints, and the spec). `StatusPillTestId` values are unchanged from the shipped enum. Both `RunView` fixtures (Tasks 2 and 4) are the same complete-base builder; both `DashboardApproval` fixtures (Tasks 3 and 4) carry the full contract field set with no `as` casts.
