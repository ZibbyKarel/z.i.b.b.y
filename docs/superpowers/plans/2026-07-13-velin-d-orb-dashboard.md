# Velín-D Orb Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/chat` "Cosmic" WebGL scene with the **Velín-D** orb-map visual language (evolving the existing three.js scene), keep the chat surface below it, add a center-orb overview modal + live status pill, and retire the `/settings?tab=chatUi` page.

**Architecture:** Retune the existing single-context `SceneController` and its layer modules in `apps/web/features/chat/scene/` into the Velín-D look (wireframe breathing central orb, 8 subsystem orbs on an elliptical orbit, connectors, per-orb task particles, comet handoffs). All non-scene chrome uses DS primitives + Tailwind + i18n. Real data (`useSubsystemsQuery`, runs, pipelines, derived `SceneMode`) is already wired.

**Tech Stack:** Next.js 15 App Router, React 19 (ref-as-prop, no `forwardRef`), TypeScript strict, three.js 0.185 (already a dep), TanStack Query, ts-rest `@zibby/contracts`, `@zibby/design-system`, next-intl (cs default + en), vitest + Testing Library.

## Global Constraints

- **Package manager:** `pnpm` only. Prefix shell commands with `rtk`.
- **Styling:** No inline `style={{}}` on DOM in `apps/web` EXCEPT the scene dir (`features/chat/scene/*`) and `ChatScreen.tsx`, which already carry a sanctioned file-level `eslint-disable react/forbid-dom-props`. Everywhere else compose from DS primitives + Tailwind classes.
- **DS-first:** UI is composed from `@zibby/design-system` primitives; never hand-roll a primitive that exists.
- **Testids:** Every new/changed component declares a `<Component>TestId` enum and wires `data-testid`; tests select via `getByTestId`. ARIA kept as assertions only.
- **React 19:** ref-as-prop; never `forwardRef`. No `any` — use `unknown`/`satisfies`/generics.
- **i18n:** Update BOTH `apps/web/i18n/messages/cs.json` (default) and `en.json` for every key added/removed. Flat keys, `t('Key')`.
- **Data:** Real data only (D2). `SubsystemState` values are `"klid" | "bezi" | "hlaseni" | "ceka"` (idle/running/report/waiting).
- **Keep wired (do NOT remove):** `powerSaver` and `ttsVoice` on `SystemConfig` — still read by the scene and `useAutoSpeak`.
- **After every task:** `rtk pnpm check:lint` → `tsc -p apps/web` (call tsc DIRECTLY — the base config doesn't cover apps/web and `rtk pnpm typecheck` masks errors) → `rtk pnpm test`. All green before the task is "done". Commit at the end of each task.
- **Branch:** `feat/velin-d-orb-dashboard` (already created; the spec is committed there).

---

## File Structure

**Workstream A — Core overview modal (independent)**
- Create: `apps/web/features/chat/components/CoreOverviewDialog.tsx` — DS `Dialog` port of Velín-D `VcCoreDetailD`: status header, summary line, 4 state-count stats, subsystem grid.
- Create: `apps/web/features/chat/components/CoreOverviewDialog.test.tsx`
- Create: `apps/web/features/chat/components/CoreOverviewDialog.stories.tsx`

**Workstream D — Settings/chatUi removal (independent)**
- Delete: `apps/web/features/settings/components/ChatUiSection.tsx` (+ any `.test`/`.stories` sibling)
- Delete: `apps/web/features/speech/` (whole dir — no other real consumer)
- Modify: `apps/web/features/settings/Screen.tsx` (drop the `chatUi` tab)
- Modify: `apps/web/i18n/messages/cs.json`, `en.json` (drop `settings.chatUi.*`)

**Workstream E — Top-bar status pill (independent, small)**
- Create: `apps/web/features/chat/components/StatusPill.tsx` — derives counts from subsystems, renders the "Nominal · N pracují · N hlášení · N čekají" pill (DS primitives).
- Create: `apps/web/features/chat/components/StatusPill.test.tsx`
- Modify: `apps/web/features/chat/components/ChatScreen.tsx` (mount `StatusPill` in the top bar)
- Modify: `apps/web/i18n/messages/cs.json`, `en.json` (`chat.statusPill.*`)

**Workstream B+C — Scene retune + interaction (coupled, single owner)**
- Modify: `apps/web/features/chat/scene/*` (orb/placement/connectors/particles/background — see B tasks)
- Modify: `apps/web/features/chat/components/ChatScreen.tsx` (center-orb click → `CoreOverviewDialog`)
- Modify: scene test/story siblings

**Parallelization:** A, D, E have **no shared files** with each other or with the scene internals — dispatch them concurrently. B+C shares `ChatScreen.tsx` with E (top bar) and depends on A (`CoreOverviewDialog`), so it runs after A lands and coordinates the `ChatScreen` edits with E (E owns the top-bar pill mount; C owns the center-orb click state). Only B+C touches `sceneController.ts`/`sceneTypes.ts` — never fan two agents onto them.

---

## Task A1: `CoreOverviewDialog` (center-orb overview modal)

**Files:**
- Create: `apps/web/features/chat/components/CoreOverviewDialog.tsx`
- Test: `apps/web/features/chat/components/CoreOverviewDialog.test.tsx`
- Story: `apps/web/features/chat/components/CoreOverviewDialog.stories.tsx`
- Modify: `apps/web/i18n/messages/cs.json`, `en.json`

**Interfaces:**
- Consumes: `useSubsystemsQuery()` from `../../subsystems/queries/useSubsystemsQuery` → `SubsystemWithStatus[]` (`{ id, name, color, state: "klid"|"bezi"|"hlaseni"|"ceka", … }`); `Dialog`, `Stack`, `Typography`, `StatusDot`, `Icon` from `@zibby/design-system`.
- Produces: `export function CoreOverviewDialog({ open, onClose, onSelectSubsystem }: CoreOverviewDialogProps)` where `CoreOverviewDialogProps = { open: boolean; onClose: () => void; onSelectSubsystem: (id: SubsystemId) => void }`; `export enum CoreOverviewDialogTestId { Root, Close, Stat, SubsystemRow }`.

- [ ] **Step 1: Read the reference + neighbors.** Read the prototype `VcCoreDetailD` in the Claude Design project file `zibby/velin-d.jsx` (already summarized in the spec) for content/layout, and read an existing DS `Dialog` consumer (e.g. `apps/web/features/chat/components/ChatDetailDialog.tsx`) for the project's dialog pattern + testid conventions. Confirm the `Dialog` API (`open`/`onClose`/width) and `useSubsystemsQuery` return shape.

- [ ] **Step 2: Write the failing test.**

```tsx
// CoreOverviewDialog.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/renderWithProviders"; // confirm exact path in step 1
import { CoreOverviewDialog, CoreOverviewDialogTestId } from "./CoreOverviewDialog";

// Mock the subsystems query with a mixed-state roster.
vi.mock("../../subsystems/queries/useSubsystemsQuery", () => ({
  useSubsystemsQuery: () => ({
    data: [
      { id: "forge", name: "Forge", color: "#5b8def", state: "bezi" },
      { id: "loom", name: "Loom", color: "#3fcf8e", state: "hlaseni" },
      { id: "scout", name: "Scout", color: "#f0b429", state: "ceka" },
      { id: "vault", name: "Vault", color: "#66737f", state: "klid" },
    ],
  }),
}));

describe("CoreOverviewDialog", () => {
  it("renders the roster and per-state stat counts when open", () => {
    renderWithProviders(
      <CoreOverviewDialog open onClose={() => {}} onSelectSubsystem={() => {}} />,
    );
    expect(screen.getByTestId(CoreOverviewDialogTestId.Root)).toBeInTheDocument();
    // 4 subsystem rows
    expect(screen.getAllByTestId(CoreOverviewDialogTestId.SubsystemRow)).toHaveLength(4);
  });

  it("selecting a subsystem row calls onSelectSubsystem and closes", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(
      <CoreOverviewDialog open onClose={onClose} onSelectSubsystem={onSelect} />,
    );
    screen.getAllByTestId(CoreOverviewDialogTestId.SubsystemRow)[0]!.click();
    expect(onSelect).toHaveBeenCalledWith("forge");
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing interactive when closed", () => {
    renderWithProviders(
      <CoreOverviewDialog open={false} onClose={() => {}} onSelectSubsystem={() => {}} />,
    );
    expect(screen.queryByTestId(CoreOverviewDialogTestId.Root)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails.** Run: `rtk pnpm vitest run apps/web/features/chat/components/CoreOverviewDialog.test.tsx`. Expected: FAIL (module not found).

- [ ] **Step 4: Implement `CoreOverviewDialog.tsx`.** Compose a DS `Dialog` (no inline styles). Header: butler mark + "ZIBBY" + a `StatusDot tone="ok"` + a one-line summary (see step 5 for the summary source). A stat row of 4 counts derived from subsystem states: `bezi`→"pracují", `hlaseni`→"hlášení čeká", `ceka`→"čekají na tebe", `klid`→"v klidu". A 2-col grid of subsystem rows (color dot + name + state label); each row is a `Pressable`/button that calls `onSelectSubsystem(id)` then `onClose()`. All strings via `t("chat.overview.*")`. Derive counts with a small pure helper:

```tsx
const countByState = (subs: SubsystemWithStatus[]) => ({
  bezi: subs.filter((s) => s.state === "bezi").length,
  hlaseni: subs.filter((s) => s.state === "hlaseni").length,
  ceka: subs.filter((s) => s.state === "ceka").length,
  klid: subs.filter((s) => s.state === "klid").length,
});
```

Gate the whole render on `open` (`if (!open) return null;`) so the closed-state test passes and no data renders while hidden. Declare `CoreOverviewDialogTestId` and wire `Root` (dialog body), `Close`, `Stat` (each stat), `SubsystemRow` (each row).

- [ ] **Step 5: Overview summary source.** Prefer reusing `useBriefingQuery` from `apps/web/features/overview/queries/` IF its result is a cheap short string; check its shape in step 1. If it is heavier than a one-liner or needs generation, instead render a derived summary from the counts (e.g. `t("chat.overview.summary", { working, report, waiting })`). Pick one; do not add a new endpoint.

- [ ] **Step 6: Add i18n keys.** Add `chat.overview.title`, `chat.overview.role`, `chat.overview.summary`, `chat.overview.statWorking`, `chat.overview.statReport`, `chat.overview.statWaiting`, `chat.overview.statIdle`, `chat.overview.crossSubsystems` to BOTH `cs.json` and `en.json`.

- [ ] **Step 7: Run tests to verify pass.** Run: `rtk pnpm vitest run apps/web/features/chat/components/CoreOverviewDialog.test.tsx`. Expected: PASS.

- [ ] **Step 8: Storybook story.** Add `CoreOverviewDialog.stories.tsx` with an `open` story using a static roster (follow an existing chat story for the provider decorator pattern).

- [ ] **Step 9: Full checks + commit.** Run `rtk pnpm check:lint` → `tsc -p apps/web` → `rtk pnpm test`. Fix all. Then:

```bash
rtk git add apps/web/features/chat/components/CoreOverviewDialog.tsx apps/web/features/chat/components/CoreOverviewDialog.test.tsx apps/web/features/chat/components/CoreOverviewDialog.stories.tsx apps/web/i18n/messages/cs.json apps/web/i18n/messages/en.json
rtk git commit -m "feat(chat): CoreOverviewDialog for center-orb overview"
```

---

## Task D1: Remove the `/settings?tab=chatUi` page + dead speech code

**Files:**
- Delete: `apps/web/features/settings/components/ChatUiSection.tsx`
- Delete: `apps/web/features/speech/` (whole dir)
- Modify: `apps/web/features/settings/Screen.tsx`
- Modify: `apps/web/i18n/messages/cs.json`, `en.json`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new. (Removal only. `SystemConfig.powerSaver`/`ttsVoice` are LEFT intact — still read by `CosmicScene`/`useAutoSpeak`.)

- [ ] **Step 1: Confirm no live consumers of `features/speech` remain.** Run: `rtk grep -rn "features/speech\|useSpeechStatusQuery\|useSpeechVoicesQuery\|SpeechDaemonState" apps/web --include=*.ts --include=*.tsx | rtk grep -v "features/speech/" | rtk grep -v "\.next"`. Expected: the ONLY hit is `ChatUiSection.tsx` (being deleted). If anything else appears, STOP and report — do not delete the shared code.

- [ ] **Step 2: Edit `settings/Screen.tsx`.** Remove: the import `import { ChatUiSection } from "./components/ChatUiSection";` (line ~28); the `"chatUi"` entry from the `SETTINGS_TABS` array (line ~100); the `<Tab value="chatUi">{t("chatUi.title")}</Tab>` line (~163); and the entire `<TabPanel value="chatUi"><ChatUiSection /></TabPanel>` block (~218-220). Leave the `"chat"` (persona) tab untouched.

- [ ] **Step 3: Delete the files.** Run: `rtk git rm apps/web/features/settings/components/ChatUiSection.tsx` and `rtk git rm -r apps/web/features/speech`. (Also `git rm` any `ChatUiSection.test.tsx`/`.stories.tsx` if present — check first with `rtk find "ChatUiSection" apps/web`.)

- [ ] **Step 4: Remove i18n keys.** Delete the `settings.chatUi` object (all `chatUi.*` keys: title, hint, powerSaver, powerSaverHint, voiceLabel, voiceHint, voiceAuto, voiceErrorTitle, voiceErrorDesc, statusLine, statusState.*, statusVoiceUnknown, statusUnreachable) from BOTH `cs.json` and `en.json`. Keep `settings.chat.*` (persona). Verify no other key references them: `rtk grep -rn "chatUi" apps/web/i18n`.

- [ ] **Step 5: Typecheck for dangling references.** Run: `tsc -p apps/web`. Expected: no errors (no dangling `ChatUiSection`/`SpeechDaemonState`/`useSpeech*` imports). Fix any that surface.

- [ ] **Step 6: Full checks + commit.** Run `rtk pnpm check:lint` → `tsc -p apps/web` → `rtk pnpm test`. Expected: green (a `settings/Screen.test` if present must no longer assert the chatUi tab — update it if it does). Then:

```bash
rtk git add -A apps/web/features/settings apps/web/i18n
rtk git commit -m "chore(settings): remove chatUi tab + dead speech code"
```

---

## Task E1: Top-bar live status pill

**Files:**
- Create: `apps/web/features/chat/components/StatusPill.tsx`
- Test: `apps/web/features/chat/components/StatusPill.test.tsx`
- Modify: `apps/web/features/chat/components/ChatScreen.tsx`
- Modify: `apps/web/i18n/messages/cs.json`, `en.json`

**Interfaces:**
- Consumes: `useSubsystemsQuery()` → `SubsystemWithStatus[]`; DS `Stack`, `Typography`, `StatusDot`.
- Produces: `export function StatusPill()` (self-contained, reads the query itself); `export enum StatusPillTestId { Root, Working, Report, Waiting }`.

- [ ] **Step 1: Write the failing test.**

```tsx
// StatusPill.test.tsx
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/renderWithProviders"; // confirm path
import { StatusPill, StatusPillTestId } from "./StatusPill";

vi.mock("../../subsystems/queries/useSubsystemsQuery", () => ({
  useSubsystemsQuery: () => ({
    data: [
      { id: "a", name: "A", color: "#fff", state: "bezi" },
      { id: "b", name: "B", color: "#fff", state: "bezi" },
      { id: "c", name: "C", color: "#fff", state: "hlaseni" },
      { id: "d", name: "D", color: "#fff", state: "ceka" },
    ],
  }),
}));

describe("StatusPill", () => {
  it("shows per-state counts derived from the subsystem roster", () => {
    renderWithProviders(<StatusPill />);
    expect(screen.getByTestId(StatusPillTestId.Working)).toHaveTextContent("2");
    expect(screen.getByTestId(StatusPillTestId.Report)).toHaveTextContent("1");
    expect(screen.getByTestId(StatusPillTestId.Waiting)).toHaveTextContent("1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails.** Run: `rtk pnpm vitest run apps/web/features/chat/components/StatusPill.test.tsx`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `StatusPill.tsx`.** Read the roster with `useSubsystemsQuery`, default `data ?? []`, compute `bezi`/`hlaseni`/`ceka` counts, render a rounded pill (DS `Stack` row + `StatusDot tone="ok"` + `Typography mono`) with segments `t("chat.statusPill.working", { n })` etc. Wire testids `Root`, `Working`, `Report`, `Waiting`. No inline styles — use DS props / Tailwind classes.

- [ ] **Step 4: Run test to verify it passes.** Run: `rtk pnpm vitest run apps/web/features/chat/components/StatusPill.test.tsx`. Expected: PASS.

- [ ] **Step 5: Mount in `ChatScreen` top bar.** In `ChatScreen.tsx`, import `StatusPill` and render it in the top-bar center slot (between the mode label group and the time, or replacing the bare time cluster per the Velín-D layout — place it as a centered element in the existing top-bar flex row). Coordinate with the scene owner if C is editing the same top bar concurrently (E lands first; C rebases).

- [ ] **Step 6: Add i18n keys.** `chat.statusPill.nominal`, `chat.statusPill.working`, `chat.statusPill.report`, `chat.statusPill.waiting` in BOTH catalogs (e.g. cs `"working": "{n} pracují"`).

- [ ] **Step 7: Full checks + commit.** `rtk pnpm check:lint` → `tsc -p apps/web` → `rtk pnpm test`. Then:

```bash
rtk git add apps/web/features/chat/components/StatusPill.tsx apps/web/features/chat/components/StatusPill.test.tsx apps/web/features/chat/components/ChatScreen.tsx apps/web/i18n/messages/cs.json apps/web/i18n/messages/en.json
rtk git commit -m "feat(chat): live subsystem status pill in the top bar"
```

---

## Workstream B+C — Scene retune + interaction (single owner, sequential)

**Do these in order, one owner.** `sceneController.ts`, `clusterGeometry.ts`, and
`modeVisuals.ts` are edited by several tasks below — never run two agents on them
concurrently. C1 depends on Task A1 (`CoreOverviewDialog`) being merged. Coordinate
the `ChatScreen.tsx` top-bar edit with Workstream E (E lands first; C1 rebases).

**Scene-testing reality:** shader/material look is NOT unit-testable (jsdom has no
WebGL — the scene falls back to its root div + overlay). So TDD applies to the
**pure geometry/params** (`clusterGeometry.ts`, `modeVisuals.ts`, count derivations)
and the **overlay/data-mode contracts**; visual retunes (B1/B5/B6) are verified by
the existing WebGL-free tests staying green + manual check + planner review. Where a
task has a pure function, write the test first.

Reference source (Claude Design project `2bfb0ce6-…`, already summarized in the
spec): `zibby/velin-d-orb.jsx` (orb shader + `ORB_MOTION`), `zibby/velin-d-map.jsx`
(`VcOrbitField` orbital math, elliptical placement, `vcArcPath` handoff, connectors).

---

### Task B1: Retune the orb/mini motion to the Velín-D breathing

**Files:**
- Modify: `apps/web/features/chat/scene/modeVisuals.ts` (the `BASE`/`MINI_BASE` tables)
- Modify: `apps/web/features/chat/scene/orbLayer.ts` (only if a uniform range needs widening)
- Test: `apps/web/features/chat/scene/modeVisuals.test.ts`

**Interfaces:**
- Consumes: `orbTarget(mode, energy): OrbTarget`, `miniOrbTarget(color, state): OrbTarget`, `OrbTarget { colorToken?, color?, intensity, noiseAmp, noiseSpeed, rotationSpeed, pulseAmp, pulseSpeed, glow, rings }`.
- Produces: unchanged signatures; retuned `BASE`/`MINI_BASE` values.

Velín-D `ORB_MOTION` targets to fold into the tables (amp→`noiseAmp`, speed→`noiseSpeed`, glow→`glow`, breath→`pulseSpeed` inverse — a longer breath = slower pulse):
`idle {amp .05, speed .18, glow .5, breath 1.0}`, `thinking {amp .17, speed .95, glow .82, breath .7}`, `working/bezi {amp .15, speed .85, glow .78, breath .75}`, `report/hlaseni {amp .085, speed .42, glow .68, breath .9}`, `await/ceka {amp .05, speed .16, glow .6, breath 1.35}`, `idle/klid {amp .05, speed .18, glow .5}`.

- [ ] **Step 1: Read** `modeVisuals.ts` (`BASE` map lines ~46-151, `MINI_BASE`) and note the current per-field ranges + how `orbLayer` uniforms consume them.
- [ ] **Step 2: Add/adjust a test** in `modeVisuals.test.ts` asserting the retuned invariants that matter (e.g. `orbTarget("thinking",0).noiseSpeed > orbTarget("idle",0).noiseSpeed` and `orbTarget("waiting-approval",0).pulseSpeed < orbTarget("idle",0).pulseSpeed` — await breathes slower). Run it; expect FAIL if values don't yet hold.
- [ ] **Step 3: Retune** `BASE` (central orb, keyed by `SceneMode`) and `MINI_BASE` (keyed by `SubsystemState`) to the Velín-D values above. Keep the existing `colorToken`/`color` and `rings` fields as-is (rings drives the halo, unchanged here). Widen an `orbLayer` uniform clamp only if a new value is out of its current range.
- [ ] **Step 4: Run** `rtk pnpm vitest run apps/web/features/chat/scene/modeVisuals.test.ts` → PASS.
- [ ] **Step 5: Checks + commit.** `rtk pnpm check:lint` → `tsc -p apps/web` → `rtk pnpm test`. Commit: `feat(scene): Velín-D breathing motion for orb + mini-orbs`.

---

### Task B2: Elliptical subsystem placement (octagon → ellipse)

**Files:**
- Modify: `apps/web/features/chat/scene/clusterGeometry.ts`
- Modify: `apps/web/features/chat/scene/sceneController.ts` (consume the new slots; net + entry-target rebuild from them)
- Test: `apps/web/features/chat/scene/clusterGeometry.test.ts`

**Interfaces:**
- Consumes today: `octagonSlots(radius): Slot[]`, `hubSlots(HUB_RADIUS)`, `octagonSlotsAround(node, NODE_OCTAGON_RADIUS)`, `pointToward(...)`, constants `NODE_RING_RADIUS`, `NODE_OCTAGON_RADIUS`, `HUB_RADIUS`. Controller builds `nodeSlots = octagonSlots(NODE_RING_RADIUS)` and the inline net (lines ~403-466) + `applyEntryAt` targets from them.
- Produces: `export function ellipseSlots(radiusX: number, radiusY: number, count?: number): Slot[]` (angle `a = -π/2 + i·2π/count`, `x = radiusX·cos(a)`, `y = radiusY·sin(a)`, `count` default 8, index 0 at bottom to match current octagon order); new constant `NODE_RING_RADIUS_X = NODE_RING_RADIUS * 1.5` (wider horizontal spread, Velín-D's ellipse). Central hub + orb-flight ring stay octagonal.

- [ ] **Step 1: Read** `clusterGeometry.ts` (all slot fns + the no-overlap invariant it exports/asserts) and the controller's net-build + `applyEntryAt` sections (lines ~403-466, ~590+).
- [ ] **Step 2: Write failing tests** in `clusterGeometry.test.ts`: `ellipseSlots(3,2)` returns 8 slots, slot 0 at bottom (`y ≈ -2, x ≈ 0`), horizontal extent (`max|x| ≈ 3`) > vertical (`max|y| ≈ 2`), and slots are symmetric about x. Run → FAIL (not exported).
- [ ] **Step 3: Implement `ellipseSlots`.** Keep `octagonSlots` for the hub/orb-flight rings. Update the existing no-overlap invariant/test that assumed a regular octagon node ring so it reflects the ellipse (assert min inter-node gap and node-vs-hub clearance using the elliptical `nodeSlots`; drop octagon-specific equalities).
- [ ] **Step 4: Wire the controller** to `nodeSlots = ellipseSlots(NODE_RING_RADIUS_X, NODE_RING_RADIUS)`. The inline net connector build and `applyEntryAt` entry targets already read `nodeSlots[i]` — confirm they now spread elliptically. The projection API needs no change (reads live world positions).
- [ ] **Step 5: Run** `rtk pnpm vitest run apps/web/features/chat/scene/clusterGeometry.test.ts` → PASS. Run `rtk pnpm vitest run apps/web/features/chat/scene/sceneController.test.ts` → fix any octagon-position assertions there to the elliptical layout.
- [ ] **Step 6: Checks + commit.** Full checks. Commit: `feat(scene): elliptical subsystem orbit placement`.

---

### Task B3: Center→subsystem connectors (state-tinted, live pulse)

**Files:**
- Create: `apps/web/features/chat/scene/connectorsLayer.ts` (extract + evolve the inline net)
- Modify: `apps/web/features/chat/scene/sceneController.ts` (replace the inline net build with the layer; drive its per-frame live pulse)
- Test: `apps/web/features/chat/scene/connectorsLayer.test.ts` (geometry/count only)

**Interfaces:**
- Consumes: `nodeSlots: Slot[]` (elliptical, from B2), `hubSlots(HUB_RADIUS)`, `resolveForegroundFaintHex()`, the per-mini state (`minis[i].present` + state) so live subsystems pulse.
- Produces: `export interface ConnectorsLayer { object3d: THREE.LineSegments; setNodes(slots: Slot[]): void; update(dt: number, liveFlags: boolean[]): void; dispose(): void }`; `export function createConnectorsLayer(hub: Slot[], nodes: Slot[]): ConnectorsLayer`.

Velín-D connectors are curved center↔node links with a dashed pulse when live
(`VcConnectors`, quadratic path, `strokeDasharray "2 10"` animated). In WebGL, render
each connector as a short poly-line from a hub vertex toward its node with a subtle
bend, base color `foreground-faint`; the "live pulse" = modulate that connector's
segment alpha over time (a cheap per-frame vertex-alpha wave), NOT a CSS dash.

- [ ] **Step 1: Read** the inline net build in `sceneController.ts` (lines ~403-466) to preserve its geometry conventions (BufferGeometry, additive `LineBasicMaterial`, `NET_OPACITY`).
- [ ] **Step 2: Write failing test** `connectorsLayer.test.ts`: `createConnectorsLayer(hubSlots(0.7), ellipseSlots(3,2))` yields a `LineSegments` whose position attribute has `8 · segmentsPerConnector · 2` vertices (assert the count matches N connectors), and `setNodes` updates positions. Run → FAIL.
- [ ] **Step 3: Implement `connectorsLayer.ts`** — build one `LineSegments` from hub-vertex→node poly-lines (reuse `pointToward` for the bend), `update(dt, liveFlags)` walks a per-connector alpha wave for live indices (a `uTime`-driven vertex-alpha, or animate `material.opacity` groups if simpler). Keep it a single draw call.
- [ ] **Step 4: Wire into controller** — remove the inline net build; instantiate `connectorsLayer` from `hubSlots`/`nodeSlots`, add to `cluster`, call `connectors.update(dt, minis.map(m => isLive(m.state)))` in `tick`. `isLive` = state ∈ {`bezi`,`hlaseni`,`ceka`}.
- [ ] **Step 5: Run** the layer test → PASS; `sceneController.test.ts` → fix/extend for the extracted layer.
- [ ] **Step 6: Checks + commit.** Commit: `feat(scene): center→subsystem connectors with live pulse`.

---

### Task B4: Per-subsystem orbital task particles (the signature Velín-D element)

**Files:**
- Create: `apps/web/features/chat/scene/orbitFieldLayer.ts`
- Create: `apps/web/features/chat/scene/subsystemLoad.ts` (pure: active-run count per subsystem)
- Modify: `apps/web/features/chat/scene/sceneController.ts` (own the fields; feed counts)
- Modify: `apps/web/features/chat/scene/CosmicScene.tsx` (pass runs/pipelines→counts, or reuse the existing `flightForEvent` owner resolution already imported)
- Test: `apps/web/features/chat/scene/subsystemLoad.test.ts`

**Interfaces:**
- Consumes: `runs: RunView[]`, `pipelines: Pipeline[]` (already fetched in `ChatScreen`/`CosmicScene`), the existing owner-resolution `flightForEvent`/`ownerSubsystem` mapping from `../../subsystems/components/SubsystemWeb/particle-mapping`; each mini's live world position.
- Produces: `export function activeRunsBySubsystem(runs: RunView[], pipelines: Pipeline[]): Record<SubsystemId, number>` (count of running/queued runs whose owning pipeline maps to each subsystem, capped at `MAX_ORBITERS = 6`); `export interface OrbitFieldLayer { object3d: THREE.Points; setCount(id: SubsystemId, n: number): void; update(dt, centers: Map<SubsystemId, THREE.Vector3>): void; dispose() }`; `export function createOrbitFieldLayer(): OrbitFieldLayer`.

Velín-D `VcOrbitField`: N lights orbit each orb on a tilted 3D ring (each has `R`, `inc`,
`rot`, `speed`, `phase`), depth-scaled/faded. "Each light = one processing task."

- [ ] **Step 1: Read** `particle-mapping.ts` (owner resolution + `MAX_PARTICLES`) and how `CosmicScene` already subscribes runs/pipelines via refs.
- [ ] **Step 2: Write failing test** `subsystemLoad.test.ts`: given 3 runs (2 owned by pipelines mapping to `forge`, 1 to `loom`; plus a `done` run ignored), `activeRunsBySubsystem` returns `{ forge: 2, loom: 1 }` and caps at `MAX_ORBITERS`. Run → FAIL.
- [ ] **Step 3: Implement `subsystemLoad.ts`** — filter runs to active (running/queued) statuses, resolve each to its owning subsystem via the shared mapping, tally, cap at `MAX_ORBITERS`. Pure, no three.js.
- [ ] **Step 4: Run** the test → PASS.
- [ ] **Step 5: Implement `orbitFieldLayer.ts`** — ONE `THREE.Points` pool (`8 · MAX_ORBITERS` max), each active orbiter parameterized like `VcOrbitField` (deterministic per `subsystemId:index` seed for stable orbits), positioned each frame on a tilted ring around its subsystem's live center (passed in `update`), additive small sprites tinted by subsystem color, depth-fade by z. Inactive slots alpha 0.
- [ ] **Step 6: Wire into controller** — build a `Map<SubsystemId, Vector3>` of mini centers each frame (already computed for projections — reuse), call `orbitField.update(dt, centers)`; feed counts from `activeRunsBySubsystem` when runs change (thread a `setSubsystemLoad(counts)` setter on the controller, called from `CosmicScene`'s existing runs effect). Respect `reducedMotion` (freeze) and the rest-frame budget.
- [ ] **Step 7: Checks + commit.** Full checks; the WebGL-free scene tests must stay green. Commit: `feat(scene): per-subsystem orbital task particles`. **[Planner review focus: particle-pool bound, dispose, perf on 8×6.]**

---

### Task B5: Handoff comet flare retune

**Files:**
- Modify: `apps/web/features/chat/scene/particleLayer.ts` (flight visual → comet head + 2 echo trails + burst)
- Test: `apps/web/features/chat/scene/particleLayer` behavior is exercised via `sceneController.test.ts` (emit path)

**Interfaces:**
- Consumes: `emit(from: Vector3, to: Vector3, color, durS): void`, `update(dt)`, `hasActive()`. Controller `emitFlight(from,to,color)` path unchanged.
- Produces: unchanged signatures; richer per-flight visual (head + trailing echoes; optional target burst).

Velín-D flare = bright comet (core + 2 echo trails on the same arc) + launch ring +
target burst (`VcHandoffFlare`). Keep the existing straight `from→to` lerp + pool; add
the 2 trailing echo vertices' offsetting + a brief brightness spike near arrival.

- [ ] **Step 1: Read** `particleLayer.ts` (the 1 head + 3 trail vertex layout, fade envelope, pool eviction).
- [ ] **Step 2: Adjust** the per-flight vertex sizing/alpha envelope so the head reads as a bright comet with 2 visible echo trails and a short arrival brightness spike (tune `aSize`/`aAlpha` curves; keep vertex count/pool the same — no new geometry). Reduced-motion static-glow path unchanged.
- [ ] **Step 3: Verify** via `rtk pnpm vitest run apps/web/features/chat/scene/sceneController.test.ts` (the emit path stays green) + manual check that a run handoff shows the comet.
- [ ] **Step 4: Checks + commit.** Commit: `feat(scene): comet handoff flares`.

---

### Task B6: Mute the nebula to Velín-D's clean gradient

**Files:**
- Modify: `apps/web/features/chat/scene/backgroundLayer.ts`
- Modify (if needed): `apps/web/features/chat/components/ChatScreen.tsx` (root gradient already exists via CSS vars; only touch if the Velín-D radial center differs)

**Interfaces:** unchanged (`createBackgroundLayer(mobile)`, `update`, `render`, …).

Velín-D background = `radial-gradient(ellipse 130% 100% at 50% 42%, #121a27 0%, bg 62%)`
— clean, no procedural nebula sky. The scene root already sets a CSS radial gradient.

- [ ] **Step 1: Read** `backgroundLayer.ts` — identify pass 1 (procedural nebula/star sky) vs pass 2 (faint node-web parallax).
- [ ] **Step 2: Mute pass 1** — reduce the nebula sky contribution toward transparent (let the CSS root gradient show through), keeping the faint node-web parallax (pass 2) if it reads well, or dial it down too. Do not remove the layer/renderer plumbing (dispose/resize stay).
- [ ] **Step 3: Verify** the scene root CSS gradient matches Velín-D's `at 50% 42%` center; adjust the root class in `ChatScreen.tsx` only if needed (Tailwind arbitrary value, no inline style unless under the sanctioned escape hatch already present).
- [ ] **Step 4: Checks + commit.** Commit: `feat(scene): clean radial background, muted nebula`.

---

### Task C1: Center-orb click → `CoreOverviewDialog`

**Files:**
- Modify: `apps/web/features/chat/components/ChatScreen.tsx`
- Modify: `apps/web/features/chat/scene/CosmicScene.tsx` + `apps/web/features/chat/scene/SubsystemOrbsOverlay.tsx` (add a center hit-target) OR add a dedicated centered click affordance — see step 1
- Test: extend `apps/web/features/chat/scene/SubsystemOrbsOverlay.test.tsx` (center hit-target) or a `ChatScreen`-level test

**Interfaces:**
- Consumes: `CoreOverviewDialog` (Task A1), `useSubsystemsQuery`, the projection API (the central orb's projected center is derivable; simplest: a fixed centered hit-target over the orb).
- Produces: a `coreOverviewOpen` state + `onOpenCore`/`onClose` handlers in `ChatScreen`.

- [ ] **Step 1: Decide the hit-target.** Simplest, testable, a11y-correct: render a centered `role="button"` "ZIBBY overview" affordance over the orb inside `SubsystemOrbsOverlay` (it already owns the projected DOM layer) OR a small labelled button in `ChatScreen`'s scene area. Prefer the overlay center hit-target (keeps interactive DOM in one place); give it a `CoreHitTestId`.
- [ ] **Step 2: Write failing test** — clicking the center hit-target fires `onOpenCore`. Run → FAIL.
- [ ] **Step 3: Implement** — add the center hit-target + `onOpenCore` prop through `CosmicScene`→overlay; in `ChatScreen` add `const [coreOpen, setCoreOpen] = useState(false)`, pass `onOpenCore={() => setCoreOpen(true)}`, and render `<CoreOverviewDialog open={coreOpen} onClose={() => setCoreOpen(false)} onSelectSubsystem={(id) => { setCoreOpen(false); setSelectedSubsystemId(id); }} />` (reuses the existing `SubsystemDrawer` selection — D4).
- [ ] **Step 4: Run** the test → PASS.
- [ ] **Step 5: Checks + commit.** Commit: `feat(chat): open ZIBBY overview from the center orb`.

---

### Task C2: Scene stories + final integration sweep

**Files:**
- Modify: `apps/web/features/chat/scene/CosmicScene.stories.tsx`, `CosmicScene.test.tsx`, `SubsystemOrbsOverlay.test.tsx` as needed

- [ ] **Step 1:** Update `CosmicScene.stories.tsx` so the story roster exercises the elliptical layout + a couple of live subsystems (particles/connectors visible).
- [ ] **Step 2:** Ensure `CosmicScene.test.tsx` still asserts the `data-mode` + overlay contracts (WebGL-free) after the retune; update any assertion that referenced the old net/positions.
- [ ] **Step 3: Full suite + manual verify.** `rtk pnpm check:lint` → `tsc -p apps/web` → `rtk pnpm test`; then `rtk pnpm web:dev` and eyeball `/chat`: elliptical orb map, breathing wireframe orbs, connectors + live pulse, per-subsystem particles, comet handoff on a run event, center-orb → overview modal, subsystem-orb → existing drawer, chat below intact, status pill live.
- [ ] **Step 4: Commit** any story/test fixes: `test(scene): update stories + contracts for Velín-D layout`.

---

## Self-Review (planner)

**Spec coverage:** §5.1 orb → B1; §5.2 subsystem ellipse/halo/particles → B2 (placement) + B1 (halo via mode table) + B4 (particles); §5.3 connectors → B3; §5.4 handoff → B5; §5.5 background → B6; §5.6 status pill → E1; D3 overview modal → A1 + C1; D4 keep drawer → C1 step 3 reuse; D8 settings removal → D1; D8 leave powerSaver/ttsVoice → Global Constraints + D1 step 2/5. All spec sections map to a task.

**Placeholder scan:** none — every code step shows code or an exact command; scene visual steps that can't be unit-tested say so explicitly and give the concrete target values/reference.

**Type consistency:** `ellipseSlots`, `createConnectorsLayer`/`ConnectorsLayer`, `activeRunsBySubsystem`, `createOrbitFieldLayer`/`OrbitFieldLayer`, `CoreOverviewDialogTestId`, `StatusPillTestId`, `MAX_ORBITERS` used consistently across the tasks that produce/consume them. `SubsystemState` values (`klid`/`bezi`/`hlaseni`/`ceka`) and `SceneMode` (8 values) match the contract + `sceneTypes.ts`.

**Revised risk note (supersedes spec §8):** the orb is already a wireframe/noise
material and placement is a pure parameterized function, so B1/B2/B3/B6 are
lower-risk retunes. The real net-new work is **B4** (per-subsystem orbital particles)
— that's the planner-review focus for pool bounds, dispose, and 8×6 perf.
