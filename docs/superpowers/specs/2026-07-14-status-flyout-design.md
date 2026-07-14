# Status-pill hover flyout — Design Spec (Velín-D phase 3a)

> Source of truth for the `/chat` status-pill hover flyout. Visual/behaviour copy is
> extracted verbatim from the Velín-D prototype (`.superpowers/sdd3/design-flyout.md`);
> the real data wiring, accessibility, and load-state contracts (which the prototype
> lacks) are defined here. Binding operator + orchestrator decisions live in
> `.superpowers/sdd3/progress.md` and are **not** re-litigated below.

## 1. Scope

Two sections only (reports **omitted** per operator decision — the pill keeps its report
count segment visible but it is **not** a flyout trigger):

- **Working** — hovering the pill's "N pracují" segment opens the **"Pracují"** panel
  (width 640): live runs in a 2-column grid.
- **Waiting** — hovering the pill's "N čekají na tebe" segment opens the **"Čeká na tvé
  rozhodnutí"** panel (width 720): pending approvals in a 2-column grid, each with
  approve/reject.

Out of scope this phase: the reports section, subsystem detail navigation from a work row
(the prototype's `onOpenSys` has no real target — work rows are non-navigating this phase),
and any pill-count change (counts are shipped and unchanged).

## 2. Component placement decision (DS vs app-local)

**Decision: the entire flyout is app-local under `apps/web/features/chat/`. No new DS
primitive is created.** The project convention is "DS is the default source of primitives;
domain composites live in `features/<domain>/`, and when a needed primitive doesn't exist,
decide explicitly." Here the decision is explicit and lands on app-local for three reasons.
(1) **Single consumer.** A hover-anchored, section-swapping, keyboard-dismissable portal
panel exists for exactly one surface — the chat status pill — so extracting a generic DS
`HoverPanel` now is speculative generality with no second caller. (2) **The repo's own
precedent is inline mechanics, not a shared primitive.** `Dropdown` owns its portal +
`getBoundingClientRect` + `createPortal(document.body)` + fixed-placement logic *inline* and
has never been factored into a reusable positioning primitive; following that established
pattern, this flyout owns its equivalent mechanics locally rather than inventing the shared
abstraction the codebase has so far declined to build. (3) **The content is domain-specific.**
The panel body is `RunView` work rows and `DashboardApproval` rows with approve/reject
mutation wiring — pure chat/approvals domain, not DS-generic. The panel surface is **solid**
(not `GlassSurface`), built from existing DS primitives (`Container` for the positioned
portal shell via its sanctioned `style` passthrough, `Card`/`Stack`/`Typography`/`Button`/
`HoldButton`/`Tag`/`StatusDot`/`Icon`), so no new DS chrome is required either. The extraction
trigger to revisit: **a second hover-anchored portal consumer** — at that point promote the
`useStatusFlyout` hover state machine + a positioned-portal shell into DS.

## 3. Architecture & data flow

```
StatusPill.tsx  (MODIFY — becomes the trigger host)
├─ useStatusFlyout()            ← hover/keyboard state machine (activeSection, 200ms grace)
├─ segment buttons: working ▸ openTo("working")   waiting ▸ openTo("waiting")
│                    report (plain, non-interactive — unchanged)
└─ <StatusFlyoutPanel …/>       ← portal to document.body, mounted only when open
     ├─ header (section title + row count)
     └─ body — one of:
        ├─ WorkingBody   ← useRunsQuery()      → runs.filter(WORKING_STATUSES) → <FlyoutWorkRow/>
        └─ WaitingBody   ← useApprovalsQuery()  → DashboardApproval[]           → <FlyoutApprovalRow/>
```

**Freshness.** Both bodies read fully SSE-wired queries (`useRunsQuery`, `useApprovalsQuery`)
— invalidated on run-scope + `approval-*` events, no poll while the `/api/events` stream is
connected (`current-state.md §6`). So flyout content is near-instant. (The pill's own counts
still come from the 15s-poll `useSubsystemsQuery` and are untouched; the flyout section counts
are computed from the runs/approvals rows and **may differ from the pill number — accepted and
truthful** per `progress.md`.)

**Working-section source.** `useRunsQuery()` returns `{ runs, isPending, isError, refetch }`.
The working body filters to in-flight runs:

```ts
// statusFlyout.ts — runs actively in flight (running + spawning). Pending "reads as
// live (pulses)" per RUN_STATE; both are what "pracují" means. Deliberately narrower
// than RUN_STATUS_GROUPS.running to include the spawning `pending` row.
export const WORKING_STATUSES: ReadonlySet<TaskRunStatus> = new Set(["running", "pending"]);
```

**Waiting-section source.** `useApprovalsQuery()` → `DashboardApproval[]` (richer than a
`RunView` — carries `riskType`, severity `risk`, `requestedAt`, `skill`, `action`, parsed
`summary`/`detail`). All rows get approve + reject.

## 4. Component boundaries — props & TestId enums

### 4.1 `useStatusFlyout` (`apps/web/features/chat/useStatusFlyout.ts`)

The hover/keyboard state machine — no DOM, no portal, fully unit-testable with fake timers.

```ts
export type FlyoutSection = "working" | "waiting";

export interface UseStatusFlyout {
  /** The open section, or null when closed. */
  activeSection: FlyoutSection | null;
  /** true when a section is open. */
  open: boolean;
  /** Open (or swap to) a section immediately; cancels any pending close. */
  openTo: (section: FlyoutSection) => void;
  /** Arm the shared 200ms close grace (called on mouse-leave of pill OR panel). */
  scheduleClose: () => void;
  /** Cancel a pending close (called on mouse-enter of pill OR panel). */
  cancelClose: () => void;
  /** Close now (Escape / focus-out). */
  close: () => void;
}

export const CLOSE_GRACE_MS = 200;
```

Implementation notes: `activeSection` is `useState<FlyoutSection | null>`; the close timer is
a `useRef<ReturnType<typeof setTimeout> | null>`. `openTo` clears the timer then sets the
section (instant open + instant section-swap, no open delay — matches the prototype).
`scheduleClose` sets a `CLOSE_GRACE_MS` timeout to `setActiveSection(null)`. Cleanup clears
the timer on unmount.

### 4.2 `StatusFlyoutPanel` (`apps/web/features/chat/components/StatusFlyoutPanel.tsx`)

Portal shell + positioning + animation + the two section bodies.

```ts
export interface StatusFlyoutPanelProps {
  section: FlyoutSection;
  /** Rect of the pill (StatusPill root) — panel is centered under it. */
  anchorRect: DOMRect | null;
  /** Rect of the hovered segment — sets the scale animation's transform-origin. */
  originRect: DOMRect | null;
  /** Hover bridge — moving pill↔panel must cancel the pending close. */
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  /** Escape / focus-out inside the panel closes and restores focus to the trigger. */
  onRequestClose: () => void;
}

export enum StatusFlyoutTestId {
  Root = "chat-status-flyout",
  Header = "chat-status-flyout-header",
  Body = "chat-status-flyout-body",
}
```

Renders `createPortal(<Container position="fixed" …>, document.body)`. The panel is
`role="dialog"`, `aria-labelledby={headerId}`. Body is `WorkingBody` or `WaitingBody`
(internal to this file). Both bodies wrap their grid in the shared `Collection` component
(`apps/web/components/Collection`) so loading → error → empty → grid is honest and never
flashes (see §8).

### 4.3 `FlyoutWorkRow` (`apps/web/features/chat/components/FlyoutWorkRow.tsx`)

Presentational; the glyph is passed in (the section owns the one `useRunGlyphMap()` call, as
`ChatTaskRow` does — no per-row query).

```ts
export interface FlyoutWorkRowProps {
  run: RunView;
  glyph: IconName;
}
export enum FlyoutWorkRowTestId {
  Root = "chat-flyout-work-row",
  Meta = "chat-flyout-work-row-meta",
  Progress = "chat-flyout-work-row-progress",
}
```

Row anatomy (reusing existing helpers — `run.ts`):
- `tone = runStateTone(run.status) ?? "accent"` (helper returns `StateTone | undefined` — the
  default is mandatory; the prototype's subsystem-hue dot has no `RunView` equivalent).
- Meta row (`Meta` testid): `StatusDot tone={tone}` + `run.owner` (`Typography mono uppercase`,
  faint, `weight="semibold"`, `tracking="wide"`) + right-aligned relative start from
  `run.startedAt` (`Typography mono`, faint) via `Intl.RelativeTimeFormat`.
- Title: `runTitle(run)` (`Typography size="sm" weight="semibold"`, single-line ellipsis).
- Bottom meta line (`Progress` testid **only when `run.pct != null`**): `Icon name={glyph}` +
  `Typography mono tone="run"` reading `run.owner` + (when `pct != null`) ` · {pct}%`.
- Non-navigating this phase (no `onSelect`/`onClick`).

### 4.4 `FlyoutApprovalRow` (`apps/web/features/chat/components/FlyoutApprovalRow.tsx`)

Presentational **and self-wired** to the approval mutations — the row calls the mutations
directly. **GATE-BUG law (66af534a): reject MUST call `useRejectMutation` directly — never a
generic remove/dismiss/delete callback.** This is the single most important correctness
constraint in the feature.

```ts
export interface FlyoutApprovalRowProps {
  approval: DashboardApproval;
}
export enum FlyoutApprovalRowTestId {
  Root = "chat-flyout-approval-row",
  Approve = "chat-flyout-approval-approve",
  Reject = "chat-flyout-approval-reject",
}
```

Wiring (mirrors `ApprovalCard` + `RunApprovalGate`):
- `const approve = useApproveMutation(); const reject = useRejectMutation();` (both are the
  no-arg `makeInvalidatingMutation` hooks; they return the mutation object directly).
- Call shape everywhere: `mutate({ params: { id: approval.id }, body: {} })`.
- `const hold = approval.riskType != null && HIGH_RISK_TYPES.has(approval.riskType);`
- **Approve** = `HoldButton` when `hold` (platba/mazání), else `Button icon="check" tone="ok"`.
  Both call `approve.mutate(...)`. The one-click `Button` carries
  `data-testid={FlyoutApprovalRowTestId.Approve}` (Button spreads `ButtonHTMLAttributes`);
  **`HoldButton` does NOT forward `data-testid`** (fixed `HoldButtonTestId.Root` — same trap
  class as CodeBlock), so the hold branch is selected in tests via `HoldButtonTestId.Root`.
  HoldButton props exactly as `ApprovalCard`: `block armedLabel={t("holdArmed")}
  doneLabel={t("holdDone")} label={t("holdToApprove")} tone={approval.riskType === "mazani" ?
  "bad" : "warn"} onConfirm={…}`.
- **Reject** = `Button icon="x" intent="ghost"` (never hold-gated anywhere),
  `data-testid={FlyoutApprovalRowTestId.Reject}`, `onClick={() => reject.mutate({ params: { id:
  approval.id }, body: {} })}` — **directly the reject mutation**.
- Row anatomy: meta row = `StatusDot pulse tone="wait"` (design-faithful: every real approval
  is the prototype's `await` kind → ZT.wait; note `DotTone` has `"wait"`, not `"warn"`) +
  `approval.skill` (`Typography mono uppercase` faint semibold) + right-aligned `Tag
  icon={riskIcon[kind]} tone={kind}` chip (`t(`riskTag.${kind}`)`) when `riskType` is known +
  relative `approval.requestedAt`; title line = `{skill} {t("wants")} {action}` exactly like
  `ApprovalCard` (`approval.skill` mono accent); body = `approval.detail`. No bespoke severity
  meter this phase.
- Optimistic terminal state like `ApprovalCard`: a local `done: "ok" | "no" | null` flips the
  controls to an `Alert` (`t("approved")`/`t("rejected")`) after the click; the query
  invalidation (in the mutation hook) removes the row on the next fetch.

### 4.5 `StatusPill` (`apps/web/features/chat/components/StatusPill.tsx` — MODIFY)

The pill mounts the state machine and the panel. TestId enum keeps its existing members
(test continuity):

```ts
export enum StatusPillTestId {
  Root = "chat-status-pill",
  Working = "chat-status-pill-working",   // now a trigger <button>
  Report = "chat-status-pill-report",     // unchanged plain segment
  Waiting = "chat-status-pill-waiting",   // now a trigger <button>
}
```

- The working + waiting segments become `<button type="button">` triggers (DS `Pressable` is
  acceptable if it renders a real button; a bare `<button>` with no inline style is fine — a
  raw button in a bespoke control is a sanctioned pattern per `project_ds_raw_buttons`). Each
  carries: `aria-haspopup="dialog"`, `aria-expanded={open && activeSection === "<section>"}`,
  `aria-controls={panelId}`; `onPointerEnter`/`onFocus` → `openTo(section)`; `onKeyDown`
  Enter/Space/ArrowDown → `openTo(section)` **and move focus into the panel** (see §6);
  Escape → `close()`. The report segment stays a plain `Typography` (unchanged).
- The pill root (`Root` testid) keeps a `ref` for `anchorRect`; each trigger keeps a ref for
  its `originRect`. `onMouseEnter` on the root → `cancelClose`; `onMouseLeave` on the root →
  `scheduleClose` (shared 200ms grace with the panel).
- `<StatusFlyoutPanel section={activeSection} … />` is rendered only when `open`.

## 5. Visual contract (prototype → tokens)

Phase 2 already landed the ZT palette as DS tokens/CSS vars. Every design color maps to an
**existing** token — no new color token is required.

| Design (ZT) | value | Token / CSS var |
|---|---|---|
| row background (`ZT.bg`) | `#0b0e13` | `--color-background` (`Card background="background"`) |
| panel background (`ZT.surfaceHi`) | `#151c25` | `--color-elevated` |
| row/header border (`ZT.line`) | `rgba(255,255,255,0.08)` | `--color-border` |
| panel border (`ZT.lineHi`) | `rgba(255,255,255,0.14)` | `--color-border-strong` |
| title ink (`ZT.ink`) | `#e6edf3` | `--color-foreground` |
| body ink (`ZT.ink2`) | `#9aa7b4` | `--color-foreground-dim` (`Typography variant="secondary"`) |
| sys/timestamp ink (`ZT.ink3`) | `#66737f` | `--color-foreground-faint` (`Typography variant="tertiary"`) |
| working hue (`ZT.run`) | `#7aa5f8` | `--color-run` / `Typography|StatusDot tone="run"` |
| waiting hue (`ZT.wait`) | `#f0b429` | `--color-warn` / `tone="warn"` |
| incident hue (`ZT.bad`) | `#ff6b6b` | `--color-danger` / `tone="bad"` |
| report/approve hue (`ZT.ok`) | `#3fcf8e` | `--color-ok` / `tone="ok"` |
| control radius (`ZT.rCtl` 6) | `6px` | `--radius-sm` / `Card radius="md"` |
| panel radius (`ZT.rPanel` 10) | `10px` | `--radius-lg` / `Container` style `var(--radius-lg)` |
| panel ambient shadow | `0 30px 80px rgba(0,0,0,0.6)` | `--shadow-modal` |

**Section geometry** (literals, not tokens — layout constants in `statusFlyout.ts`):

```ts
// NOTE the two tone fields: DS DotTone has "wait" but no "warn"; TypographyTone has
// "warn" but no "wait" — one field cannot serve both components.
export const SECTION_META: Record<FlyoutSection, {
  width: number;
  dotTone: "run" | "wait";        // StatusDot (DotTone vocabulary)
  titleTone: "run" | "warn";      // Typography (TypographyTone vocabulary)
  ringShadow: string; headerGradient: string;
}> = {
  working: {
    width: 640, dotTone: "run", titleTone: "run",
    // ZT.run #7aa5f8 @ 0x22 ≈ 13% alpha — the ONE value with no token (see flag below)
    ringShadow: "0 0 0 1px rgba(122,165,248,0.13)",
    headerGradient: "linear-gradient(180deg, rgba(122,165,248,0.08), transparent)",
  },
  waiting: {
    width: 720, dotTone: "wait", titleTone: "warn",
    ringShadow: "0 0 0 1px rgba(240,180,41,0.13)",
    headerGradient: "linear-gradient(180deg, rgba(240,180,41,0.08), transparent)",
  },
};
```

Panel `Container` (via its sanctioned `style` passthrough — the eslint `react/forbid-dom-props`
rule targets raw DOM nodes, not DS component `style` props):
- Positioned by props where available: `position="fixed"`, `zIndex={60}`, `maxHeight="76vh"`,
  `overflow="auto"`.
- Dynamic geometry + surface via `style`: `left`, `top`, `width` (from `SECTION_META.width`),
  `transformOrigin`, `transform`, `transition`, `opacity`, and the static-but-computed surface
  values `background: "var(--color-elevated)"`, `border: "1px solid var(--color-border-strong)"`,
  `borderRadius: "var(--radius-lg)"`, `boxShadow: `${SECTION_META[section].ringShadow},
  var(--shadow-modal)``.

**Typography px vs DS sizes.** The prototype's exact sizes (15/13/12.5/11.5/10.5/9.5px) are
approximated by the nearest DS `Typography` size tokens — panel title ≈ `size="md"`, row title
≈ `size="sm"`, body ≈ `size="sm" variant="secondary"`, meta/sys/timestamp ≈ `size="xs"`. **We
accept token sizes rather than mint pixel-exact new sizes** — no new typography token.

**Flagged value needing no token but a computed style.** The section-accent ring
(`0 0 0 1px <sectionHue>@13%`) has no DS token (there is no "state hue at 13% alpha" scale). It
is a precomputed static rgba in `SECTION_META.ringShadow`, composed with `var(--shadow-modal)`
and passed through the `Container` `style` passthrough. No new token; documented as the single
bespoke visual value.

**Animation (verbatim from prototype).** On closed→open only (guarded by a `wasOpen` ref, never
on section-swap): `transform: scale(0.08) → scale(1)` over `.32s cubic-bezier(.2,.8,.2,1)` with
`opacity 0→1` over `.2s ease`, `transformOrigin` X = the hovered segment's screen-center
relative to the panel's left edge (`Math.min(100, Math.max(0, ((originRect.left +
originRect.width/2 - left) / width) * 100))`%), Y = `0%`. Positioning: `left = round(anchorRect.left
+ anchorRect.width/2 - width/2)`, `top = round(anchorRect.bottom + 10)`.

## 6. Interaction contract

### 6.1 Hover state machine (exact timings, from prototype)

- **Instant open on segment hover.** `onPointerEnter` on a trigger → `openTo(section)` (no open
  delay).
- **Instant section-swap.** Hovering the other trigger while open → `openTo(other)` switches
  `activeSection` with **no re-animation** (the `wasOpen` ref suppresses the scale-in).
- **Shared 200ms close grace.** `scheduleClose()` (a `CLOSE_GRACE_MS = 200` timeout) is armed
  only on `onMouseLeave` of the pill root **or** the panel; `cancelClose()` fires on
  `onMouseEnter` of either. Moving the pointer pill↔panel therefore never closes; leaving both
  for 200ms closes.
- **Positioning: fixed, under the pill center** — `left = pillCenter − width/2`, `top =
  pillBottom + 10`. Recompute the anchor rect on each open (and the panel escapes clipping
  because it is portalled to `document.body`, not nested in the z-laddered chat inner wrapper —
  `current-state.md §7`).

### 6.2 Keyboard accessibility (spec-defined — prototype is hover-only)

Hover-only is a WCAG violation; the flyout must be fully keyboard-operable.

- **Focusable triggers.** Working + waiting segments are real `<button>`s in the tab order,
  each with `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls={panelId}`.
- **Open by keyboard.** `Focus` on a trigger opens its section (parity with hover). `Enter`,
  `Space`, or `ArrowDown` on a focused trigger opens **and moves focus into the panel** — after
  the panel mounts (`requestAnimationFrame`), focus the panel root, which has `tabIndex={-1}`
  for exactly this. Row controls (approve/reject buttons) are then reachable with Tab. (Focusing
  the root — not a "first focusable" query — is deliberate: DS `HoldButton` doesn't forward
  data-attributes, and the root is always present regardless of body state.)
- **Escape closes.** `Escape` on a trigger or anywhere inside the panel calls `close()` and
  **restores focus to the originating trigger** (the pill keeps a ref to the last-focused
  trigger). Because focus-on-trigger normally opens, the restore sets a one-shot
  suppress-next-focus-open ref first — otherwise Escape-close would instantly reopen the panel
  (the `.focus()` call fires the trigger's `onFocus` synchronously). The suppression is armed
  **only when focus is actually being moved** (`document.activeElement !== trigger`) — if the
  trigger already holds focus (Escape pressed on the trigger itself), no focus event will fire
  and an armed flag would wrongly swallow the *next* genuine focus-open.
- **Focus-out closes.** A `focusout` whose `relatedTarget` is neither the pill nor the panel
  arms `scheduleClose()` (keyboard analogue of mouse-leave). Both blur handlers check **both**
  subtrees: the portalled panel is still a React child of the pill, so React re-dispatches
  panel focus events through the pill's handler — a pill-only check would arm the grace when
  focus moves *into* the panel. Each side recognizes the other via stable DOM ids
  (`STATUS_FLYOUT_PANEL_ID` on the panel root, `STATUS_PILL_DOM_ID` on the pill root — the
  latter lives in `statusFlyout.ts` to avoid a StatusPill↔panel import cycle).
- **Focus-in cancels.** The panel's `onFocus` is wired to `cancelClose` (the keyboard analogue
  of pointer-enter), so focus arriving in the panel defuses any pending grace.
- **Not a focus trap.** This is a hover/richness panel, not a modal — Tab may leave it (which
  triggers focus-out close). No inert background, no scrim (the hover-close + focus-out-close
  pair covers dismissal; a full-viewport click-scrim like `Dropdown`'s is unnecessary for a
  non-modal hover panel and would swallow map interaction).
- **ARIA.** Panel `role="dialog" aria-labelledby={headerId}`; each icon-only control carries an
  explicit `aria-label`/text; approve/reject buttons are naturally reachable once focus is
  inside.

## 7. i18n key table

New keys under **`chat.statusPill.flyout.*`** (headers, empty/loading/error). Every key has a
consumer (the panel's accessible name comes from `aria-labelledby` → the section title — no
separate dialog-label key). Row
controls **reuse `approval.*`** verbatim (`approve`, `reject`, `wants`, `holdToApprove`,
`holdDone`, `holdArmed`, `approved`, `rejected`, `riskTag.*`) — **do not mint a third approvals
namespace.** All catalog edits land in ONE task (Task 6).

| Key | cs | en |
|---|---|---|
| `chat.statusPill.flyout.working.title` | `Pracují` | `Working` |
| `chat.statusPill.flyout.working.emptyTitle` | `Nikdo nepracuje` | `Nothing running` |
| `chat.statusPill.flyout.working.emptyBody` | `Žádná úloha právě neběží.` | `No task is running right now.` |
| `chat.statusPill.flyout.waiting.title` | `Čeká na tvé rozhodnutí` | `Waiting for your decision` |
| `chat.statusPill.flyout.waiting.emptyTitle` | `Nic nečeká` | `Nothing waiting` |
| `chat.statusPill.flyout.waiting.emptyBody` | `žádná akce nečeká · ZIBBY sám neobjedná` | `nothing is waiting · ZIBBY never orders on its own` |
| `chat.statusPill.flyout.loading` | `Načítám…` | `Loading…` |
| `chat.statusPill.flyout.errorTitle` | `Nepodařilo se načíst` | `Couldn't load` |
| `chat.statusPill.flyout.errorBody` | `Zkus to prosím znovu.` | `Please try again.` |
| `chat.statusPill.flyout.retry` | `Zkusit znovu` | `Retry` |

(The `waiting.emptyBody` copy is the `overview.noApprovals` line verbatim — the ledger's
sanctioned precedent.) Existing `chat.statusPill.{nominal,working,report,waiting}` are unchanged;
the section header title is a **separate** key from the pill segment suffix. The header row count
is a bare integer rendered by `Typography` (no key needed).

## 8. Empty / loading / error states

Each section body wraps its grid in the shared **`Collection`** component
(`apps/web/components/Collection`), which renders `loading → error → empty → grid` in that
precedence so a pending or failed load never reads as an empty workspace:

- **Working body:** `items = runs.filter(r => WORKING_STATUSES.has(r.status))`;
  `loading = isPending ? { label: t("flyout.loading") } : undefined`;
  `error = isError ? { title: t("flyout.errorTitle"), description: t("flyout.errorBody"),
  retryLabel: t("flyout.retry"), onRetry: refetch } : undefined`;
  `empty = { glyph: "run", title: t("flyout.working.emptyTitle"), description:
  t("flyout.working.emptyBody") }`; `cols={1} sm={2} lg={2}` (2-col grid — `lg` must be set
  explicitly: `Collection` defaults `lg={3}`), `gap="100"`.
- **Waiting body:** `items = approvals`; `useApprovalsQuery()` exposes `isPending`/`isError`
  (react-query result) and a `refetch`; same `Collection` shape with `empty.glyph="ok"`,
  `title=t("flyout.waiting.emptyTitle")`, `description=t("flyout.waiting.emptyBody")`.

The panel header + accent ring render regardless of body state (an empty section still shows its
titled header, filling the prototype's gap where an empty section rendered a blank body).

## 9. Testing strategy

**jsdom limits.** jsdom has no layout (`getBoundingClientRect` returns zeros), no real hover
transitions, and portals render but positioning/animation are inert. So:

- **Unit (jsdom, vitest) — what tests cover:**
  - `useStatusFlyout`: fake timers assert instant `openTo`, `scheduleClose` closes after exactly
    `CLOSE_GRACE_MS`, `cancelClose` cancels a pending close, section-swap is instant, `close`
    is immediate, timer cleared on unmount.
  - `FlyoutWorkRow`: meta testid always present; `Progress` testid present iff `run.pct != null`;
    title = `runTitle(run)`; `runStateTone` default applied (a `scheduled`-tone run still renders).
  - `FlyoutApprovalRow` **(GATE-BUG guard — the critical test):** clicking `Reject` calls
    `useRejectMutation`'s `mutate` with `{ params: { id }, body: {} }` and **not** any
    remove/delete; clicking `Approve` on a non-high-risk approval calls `useApproveMutation`;
    a `platba`/`mazani` approval renders `HoldButton` (not a one-click Button) for approve;
    reject is never hold-gated. Mock the mutation hooks and assert the exact call shape.
  - `StatusFlyoutPanel`: renders header title from the section key, body switches on `section`,
    `Collection` shows the empty state when the query returns `[]` (assert: no row testid, body
    present — `EmptyState` has no testid of its own), the error state when `isError`
    (`LoadErrorTestId.Root`), and the loading state when `isPending` (`LoadingStateTestId.Root`)
    — mock the queries. Assert `role="dialog"` + `aria-labelledby`.
  - `StatusPill`: working/waiting segments are `<button>` with `aria-haspopup`/`aria-controls`;
    focusing a trigger sets `aria-expanded="true"` and mounts the panel testid; `Escape` unmounts
    it; the report segment is not a button.
- **Live `:3000` pass — what only the browser can verify (Task 7):** actual hover open/close with
  the 200ms grace, pointer bridge pill↔panel, scale-from-segment animation, section-swap with no
  re-animation, fixed positioning under the pill center, portal stacking **over the orb map**, a
  real approve/reject click-through on a live pending approval (if one exists), and the keyboard
  pass (Tab to trigger, Enter into panel, Escape restores focus).

Selectors are `getByTestId` (primary); roles/ARIA are **assertions only** (`toHaveRole`,
`toHaveAttribute`) per the repo testing rule.

## 10. Acceptance criteria

1. Hovering "N pracují" opens the **Pracují** panel (width 640, 2-col) of live runs; hovering
   "N čekají na tebe" opens **Čeká na tvé rozhodnutí** (width 720, 2-col) of pending approvals;
   the report segment shows its count but never opens a flyout.
2. Open is instant on hover; the panel scales in from the hovered segment; a section-swap does
   **not** re-animate; leaving both pill and panel for 200ms closes; moving between them does not.
3. The panel is portalled to `document.body`, positioned `fixed` centered under the pill, and
   renders **over** the orb map with the solid `--color-elevated` surface + section-accent ring.
4. Each waiting row approves via `useApproveMutation` (HoldButton for `platba`/`mazani`, one-click
   otherwise) and **rejects via `useRejectMutation` directly** — the GATE-BUG guard test passes.
5. Both sections show honest loading / error (with retry) / empty states; an outage never reads
   as "empty".
6. Full keyboard operation: triggers are focusable buttons with correct ARIA; Enter/Space/ArrowDown
   opens and moves focus into the panel; Escape closes and restores focus to the trigger.
7. cs/en catalogs have the new `chat.statusPill.flyout.*` keys with parity; row controls reuse
   `approval.*`; no third approvals namespace was introduced.
8. `rtk pnpm check:lint`, `rtk pnpm check:types` + `pnpm exec tsc -p apps/web --noEmit`, and
   `pnpm test` are all green (pre-existing documented flakes excepted); branch parked at the PR
   gate (no push/PR).