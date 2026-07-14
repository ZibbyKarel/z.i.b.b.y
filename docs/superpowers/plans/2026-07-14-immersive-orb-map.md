# Immersive Orb Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan. Dispatch one subagent per task, in the given order (respecting the parallel-safe markers). Steps use checkbox syntax — check each off as you complete it. Do NOT skip the per-task checks or the commit step. Never use `--no-verify`.

**Goal.** Replace the retuned shared-WebGL Cosmic scene behind the chat UI with a component-shaped **immersive orb map** built 1:1 to the Velín-D prototype: one small WebGL canvas per orb, everything else HTML/CSS/SVG. New generic components live in `libs/design-system/src/immersive/`; a thin app adapter (`SubsystemOrbMap`) maps domain data onto them. After the swap, the old `apps/web/features/chat/scene/` directory is deleted wholesale.

**Architecture.**
- **DS `immersive` bundle (generic, domain-agnostic).** `Orb` (per-orb WebGL wireframe icosahedron, ported shaders + `ORB_MOTION`), `OrbitField` (faux-3D orbiting task dots), `OrbNode` (subsystem node = Orb + icon slot + label + status row + halo/ping/shadow/float), `CoreOrb` (central orb + wordmark + heartbeat rings + thinking pulse), `ConnectorLayer` (full-bleed SVG beziers, dash-pulse on live), `HandoffFlare` (comet along a CSS Motion Path), `OrbMap` (measures container, computes the ellipse, composes the rest), plus the pure `ellipseLayout` fn and the ported `canMountWebGL` util. Components take colors/states/counts/slots — never contracts types.
- **App adapter (domain composite, in `apps/web/features/chat/`).** `SubsystemOrbMap` maps `SubsystemWithStatus[]` + runs + pipelines → generic `OrbMap` props; reuses the moved `activeRunsBySubsystem` pure fn and a `SubsystemId → IconName` map; drives core `thinking` from the chat streaming flag; implements the existing `ChatScreen` seam (`onOpenCore` / `onSelectSubsystem`).
- **Contracts.** The Czech `SubsystemState` enum `klid|bezi|hlaseni|ceka` is renamed to English `idle|running|report|waiting` across contracts + api + web + tests. Czech display strings continue to live in i18n / label maps.

**Tech Stack.** Next.js 15 App Router, React 19 (ref-as-prop, no `forwardRef`), TypeScript `strict` + `noUncheckedIndexedAccess`, Tailwind v4 (CSS-first `@theme`), `three` (WebGL), NestJS + ts-rest (contracts), Vitest + Testing Library (jsdom), Storybook, NX monorepo, pnpm, `rtk` command proxy.

---

## Global Constraints

Copied from the design spec's *Global constraints* + the repo laws. Every task obeys all of these.

1. **English-only identifiers.** No Czech (and no "velin") in component names, files, variables, enum values, testids, story titles, or commit messages. Czech appears ONLY in i18n catalogs (`apps/web/i18n/messages/cs.json`) and pre-existing Czech display-label maps. The contracts `SubsystemState` enum `klid/bezi/hlaseni/ceka` is renamed to `idle/running/report/waiting`. **Wherever this plan says "port verbatim" from the prototype, verbatim applies to code, math, GLSL, and CSS values only — translate every Czech comment to English (or strip it); no Czech comment may land anywhere under `libs/` or `apps/`.**
2. **Design file paths keep their names.** `design/Z.I.B.B.Y/…Velin-D…` is external reference material. Nothing under `apps/` or `libs/` may reference "velin".
3. **Files are the source of truth.** The UI is a view.
4. **DS is the source of UI primitives.** The immersive bundle lives inside `libs/design-system` — no second design system. Reuse existing tokens; the immersive bundle owns a small documented state-color palette mirroring the DS/ZT tokens.
5. **Sizing-API exception (scoped to `immersive`).** Immersive components take numeric px `diameter`/`size` props (48–76 px nodes, 96–264 px core) because these are continuous, viewport-computed canvas-geometry values that the sealed `Size` enum cannot express. This exception is documented in each component and confined to the `immersive` bundle. No other DS component may expose raw px.
6. **React 19.** Ref-as-prop only — never `forwardRef`. No `any` (use `unknown`/`satisfies`/generics). `noUncheckedIndexedAccess` is on — index accesses are `T | undefined`; guard them.
7. **DS inline-style is legal in `libs/design-system`.** The `react/forbid-dom-props` ESLint rule (`{ forbid: ["style"] }`) is scoped to `apps/web/**` only (see `eslint.config.mjs`, files-glob `apps/web/**`). The design system is exempt and owns the styling layer — existing DS components (e.g. `StatusDot`) already use inline `style={{...}}`. **Immersive components style all computed transforms/positions/colors with inline `style={{...}}` directly on their DOM/SVG nodes — no `eslint-disable` needed, because the rule does not apply to `libs/**`.** The app adapter (`apps/web/**`) must NOT set inline styles: it composes DS primitives and passes props to `SubsystemOrbMap`/`OrbMap` only.
8. **Scene perf contract.** No per-frame heap allocations inside rAF loops (mutate pre-allocated objects/uniforms; do not build arrays/objects/strings-that-alloc every frame beyond what the prototype already does). Every three.js resource is disposed: cancel rAF, `renderer.dispose()`, `renderer.forceContextLoss()`, and dispose geometries/materials. Honor `prefers-reduced-motion: reduce` — freeze noise time + rotation in the Orb rAF loop, and set `animation: none` (via the media query) on all CSS rings/float/dash/flare animations; check `matchMedia` inside rAF loops that run JS animation (OrbitField).
9. **Tooling & checks.** pnpm is canonical; prefix every command with `rtk` (even inside `&&` chains). After each task, in order:
   - `rtk pnpm check:lint` (ESLint `--fix .`, acts as formatter)
   - `rtk pnpm check:types` (runs `tsc -p tsconfig.base.json --noEmit && tsc -p apps/web/tsconfig.json --noEmit` — the base project covers `libs/**`, the second covers `apps/web`; both must pass)
   - `rtk pnpm test` (Vitest `run`, all projects)

     If `rtk` mangles a specific tool's output, fall back to `rtk proxy <cmd>` or the bare command; never let a masked failure through.
10. **Pre-commit self-knowledge hook.** The commit may trigger the self-knowledge generator. If the pre-commit hook fails asking for a regenerate, run `rtk pnpm self-knowledge:generate`, re-stage the regenerated artifact, and retry the commit. NEVER pass `--no-verify`.
11. **Staging discipline.** Stage only the task's own files with an explicit `git add <files>` (never `git add -A`/`git add .`), except the self-knowledge artifact when the hook regenerates it.
12. **DS testing.** Every immersive component declares a `<Component>TestId` enum and wires `data-testid` onto its meaningful parts. Tests select via `getByTestId`/`getAllByTestId`/`queryByTestId` — never `querySelector`, `firstChild`, or role/text queries used to *grab* a node. Roles/ARIA stay as **assertions** (`toHaveRole`/`toHaveAccessibleName`/`toHaveAttribute`). WebGL is gated by `canMountWebGL()` — jsdom returns `false`, so Orb-bearing components render their DOM root as a quiet no-op; no WebGL assertions in jsdom.
13. **Storybook.** DS-only. Every immersive component has exactly two story exports: `Overview` (static, all variants stacked) then `Playground` (args + `argTypes` knobs). No third story. The existing DS glob (`libs/design-system/src/**`) already covers the bundle — no `.storybook/main.ts` change.

---

### Interface contracts shared across tasks

These exact types are produced by early tasks and consumed by later ones. Do not redefine or drift.

```ts
// libs/design-system/src/immersive/orbState.ts  (created in Task 3)
export type OrbState = "idle" | "working" | "report" | "await" | "incident" | "thinking";

// Motion per state — ported verbatim from velin-d-orb.jsx ORB_MOTION.
export interface OrbMotion { amp: number; speed: number; glow: number; breath: number }
export const ORB_MOTION: Record<OrbState, OrbMotion>;

// The immersive bundle's own state-color palette (orb CHROME: halo / ping / shadow /
// status label / connector). Mirrors the ZT/DS state tokens; identity color of the
// orb BODY is the caller-supplied `hex`, never this map.
export const ORB_STATE_COLOR: Record<OrbState, string>;
export interface OrbStateStyle { color: string; live: boolean }
export const ORB_STATE: Record<OrbState, OrbStateStyle>;

// libs/design-system/src/immersive/ellipseLayout.ts  (Task 3)
export interface EllipseInsets { left: number; right: number; bottom: number }
export interface OrbPosition { x: number; y: number }
export interface EllipseLayout {
  cx: number; cy: number; radiusX: number; radiusY: number;
  nodeD: number; coreSize: number; positions: OrbPosition[];
}
export function ellipseLayout(w: number, h: number, count: number, insets: EllipseInsets): EllipseLayout;

// libs/design-system/src/immersive/OrbMap/OrbMap.tsx  (Task 10)
export interface OrbMapNode {
  id: string;            // stable key (subsystem id in the app)
  hex: string;           // identity color of the orb body
  state: OrbState;       // drives motion + chrome color
  label: string;
  statusLabel: string;   // localized status text (e.g. "pracuje")
  icon: React.ReactNode; // a DS <Icon/> instance
  activeCount: number;   // orbit dots (0..6)
}
export interface OrbMapCore {
  hex: string;
  activeCount: number;   // orbit dots (core = 4 in the app, but generic)
  intensity: number;     // 0..0.7 heartbeat cadence driver
  thinking: boolean;     // streaming → pulse
}
export interface OrbMapFlare { id: string; fromId: string; toId: string; color?: string }
export interface OrbMapProps {
  nodes: OrbMapNode[];
  core: OrbMapCore;
  insets?: Partial<EllipseInsets>;
  flares?: OrbMapFlare[];
  onSelectNode?: (id: string) => void;
  onSelectCore?: () => void;
  ref?: React.Ref<HTMLDivElement>;
}
```

---

### Task 1: Rename `SubsystemState` enum `klid/bezi/hlaseni/ceka` → `idle/running/report/waiting`

Mechanical rename across contracts + api + web + tests, so the app adapter (Task 12) can map English contract states → immersive `OrbState`. Runs first because everything downstream depends on the English enum. The doomed `scene/` files (deleted in Task 14) are renamed here too, so `check:types` stays green in the interim.

**Parallel-safe:** no (touches shared contract consumed everywhere; blocks Tasks 12–14). Rough size: L (27 files, ~107 literal edits, all mechanical).

**Files:**
- Modify (contract source): `libs/contracts/src/subsystems/subsystem.schema.ts` (enum + docstring), `libs/contracts/src/subsystems/subsystems.contract.ts`, `libs/contracts/src/subsystems/subsystems.contract.test.ts`
- Modify (api): `apps/api/src/subsystems/subsystems.service.ts`, `apps/api/src/subsystems/subsystems.service.test.ts`, `apps/api/test/subsystems.e2e.test.ts`, `apps/api/src/subsystems/subsystem-seen.store.ts` (comments only — the persisted map holds timestamps, not state values), `apps/api/src/self-knowledge/self-knowledge.composer.test.ts`
- Modify (web, non-scene): `apps/web/features/chat/components/CoreOverviewDialog.tsx`, `CoreOverviewDialog.test.tsx`, `CoreOverviewDialog.stories.tsx`, `StatusPill.tsx`, `StatusPill.test.tsx`, `ChatScreen.test.tsx`, `apps/web/features/tasks/components/CommandLine/CommandLine.test.tsx`, `apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx`, `SubsystemDrawer.test.tsx`, `AktivitaTab.test.tsx`, `GatesTab.test.tsx`, `RosterTab.test.tsx`, `ArtefaktyTab.test.tsx`
- Modify (web, scene — deleted in Task 14, renamed now to keep green): `apps/web/features/chat/scene/sceneController.ts`, `sceneController.test.ts`, `SubsystemOrbsOverlay.tsx`, `SubsystemOrbsOverlay.test.tsx`, `CosmicScene.stories.tsx`, `modeVisuals.test.ts`

**Interfaces:**
- Produces: `SubsystemStateSchema = z.enum(["idle","running","report","waiting"])`, `type SubsystemState = "idle" | "running" | "report" | "waiting"`.
- Consumes: nothing (foundation).

Rename map (apply everywhere, as quoted string literals AND `Record<SubsystemState, …>` keys):
`klid → idle`, `bezi → running`, `hlaseni → report`, `ceka → waiting`.

Steps:

- [ ] Run and save the exact literal inventory to work from:
      `rtk grep -rEn "\"(klid|bezi|hlaseni|ceka)\"" apps libs --include="*.ts" --include="*.tsx"`
- [ ] Edit `libs/contracts/src/subsystems/subsystem.schema.ts`: change the enum to `z.enum(["idle", "running", "report", "waiting"])` and rewrite the docstring above it to English semantics:
      ```ts
      /**
       * A subsystem's current activity, as read by the top-level UI. `idle` idle,
       * `running` actively working (Tier 1, quiet), `report` has a Tier-2 report ready,
       * `waiting` needs a Tier-3 decision. Phase 80 always serves `idle`; real
       * aggregation across running pipelines/goals/approvals lands in phase 82.
       */
      export const SubsystemStateSchema = z.enum(["idle", "running", "report", "waiting"]);
      export type SubsystemState = z.infer<typeof SubsystemStateSchema>;
      ```
      Also update the `SubsystemWithStatusSchema` docstring stub example `{ state: "klid", … }` → `{ state: "idle", … }`.
- [ ] Edit `apps/api/src/subsystems/subsystems.service.ts`: the priority-sort comparator and the state-derivation array (lines building `["ceka"] / ["bezi"] / ["hlaseni"] / "klid"`) and the `{ state: "klid", … }` default → English. After edit the derivation reads:
      ```ts
      ...(t3 > 0 ? (["waiting"] as const) : []),
      ...(running.has(s.id) ? (["running"] as const) : []),   // rename local `bezi` set → `running`
      ...(t2 > 0 ? (["report"] as const) : []),
      "idle",
      ```
      and the comparator branches use `"waiting"` / `"report"`; the default aggregate becomes `{ state: "idle", tier2Count: 0, tier3Count: 0 }`. Rename any local variable named `bezi` to `running` for consistency (English-only identifiers).
- [ ] Edit the api tests/fixtures (`subsystems.service.test.ts`, `test/subsystems.e2e.test.ts`) — every `state: "klid"` etc. → English. In `self-knowledge.composer.test.ts`, the two negatives `expect(markdown).not.toContain("klid")` / `not.toContain("bezi")` become vacuous after the rename (those tokens no longer exist anywhere in the codebase). **Delete both lines.** The test's real intent — "static identity only, no live status fields leak into the SUBSYSTEMS block" — is already enforced structurally (the composer consumes `Subsystem`, which has no `state` field) and behaviorally by the adjacent `not.toContain("tier2Count")` / `not.toContain("tier3Count")` assertions, which stay. Do NOT add `not.toContain("idle"/"running"/…)` — those are common English words that legitimately appear in prose. Update the `// Static identity only …` comment to note the enum-token guard was dropped as vacuous post-rename.
- [ ] Edit `subsystem-seen.store.ts` **comments only** (the `hlaseni`/`ceka` mentions in the docblock) → `report`/`waiting`. No code change (persisted map is `{[id]: timestamp}`).
- [ ] Edit each web file: re-key every `Record<SubsystemState, …>` map (`STATE_DOT`, `STATE_TAG_TONE`, the `CoreOverviewDialog` summary counts object + its interface fields `bezi/hlaseni/ceka/klid` → `running/report/waiting/idle`) and every `s.state === "…"` comparison and every fixture `state: "…"`. Preserve all Czech display strings and DS tones unchanged — only the keys/literals change. Update docstring/comment mentions of the Czech tokens to English.
- [ ] Edit the scene files (`sceneController.ts` + tests, `SubsystemOrbsOverlay.tsx` + test, `CosmicScene.stories.tsx`, `modeVisuals.test.ts`) the same way — they are deleted in Task 14 but must compile now.
- [ ] Verify no stragglers: `rtk grep -rEn "\"(klid|bezi|hlaseni|ceka)\"|'(klid|bezi|hlaseni|ceka)'" apps libs --include="*.ts" --include="*.tsx"` returns nothing.
- [ ] Run checks: `rtk pnpm check:lint && rtk pnpm check:types && rtk pnpm test`. Fix all failures.
- [ ] Commit:
      ```bash
      rtk git add libs/contracts/src/subsystems apps/api/src/subsystems apps/api/test/subsystems.e2e.test.ts apps/api/src/self-knowledge/self-knowledge.composer.test.ts apps/web/features/chat/components/CoreOverviewDialog.tsx apps/web/features/chat/components/CoreOverviewDialog.test.tsx apps/web/features/chat/components/CoreOverviewDialog.stories.tsx apps/web/features/chat/components/StatusPill.tsx apps/web/features/chat/components/StatusPill.test.tsx apps/web/features/chat/components/ChatScreen.test.tsx apps/web/features/tasks/components/CommandLine/CommandLine.test.tsx apps/web/features/subsystems/components/SubsystemDrawer apps/web/features/chat/scene/sceneController.ts apps/web/features/chat/scene/sceneController.test.ts apps/web/features/chat/scene/SubsystemOrbsOverlay.tsx apps/web/features/chat/scene/SubsystemOrbsOverlay.test.tsx apps/web/features/chat/scene/CosmicScene.stories.tsx apps/web/features/chat/scene/modeVisuals.test.ts
      rtk git commit -m "refactor(contracts): rename SubsystemState to English idle/running/report/waiting"
      ```

---

### Task 2: Move `activeRunsBySubsystem` out of `scene/` into the chat adapter folder

The pure tally fn (+ its test) must survive the `scene/` deletion. Move it up one level so the adapter (Task 12) imports it from a stable path and Task 14 can delete `scene/` cleanly.

**Parallel-safe:** yes (disjoint from all DS immersive tasks and Task 1; prerequisite for Tasks 12 & 14). Rough size: S (move 2 files, fix 3 importers).

**Files:**
- Create: `apps/web/features/chat/subsystemLoad.ts` (moved from `scene/subsystemLoad.ts`), `apps/web/features/chat/subsystemLoad.test.ts` (moved from `scene/subsystemLoad.test.ts`)
- Delete: `apps/web/features/chat/scene/subsystemLoad.ts`, `apps/web/features/chat/scene/subsystemLoad.test.ts`
- Modify: `apps/web/features/chat/scene/CosmicScene.tsx` (imports `activeRunsBySubsystem` from `./subsystemLoad`), `apps/web/features/chat/scene/orbitFieldLayer.ts` (imports `MAX_ORBITERS` from `./subsystemLoad`) — retarget both to the new location so the interim (pre-Task-14) tree stays green

**Interfaces:**
- Produces: `export function activeRunsBySubsystem(runs, pipelines): Partial<Record<SubsystemId, number>>` and `export const MAX_ORBITERS = 6` at the new path.
- Consumes: `resolveEventOwner` from `../subsystems/components/SubsystemWeb/particle-mapping`, `Pipeline` from `../../domain`, `RunView` from `../runs/run`.

Steps:

- [ ] `rtk git mv apps/web/features/chat/scene/subsystemLoad.ts apps/web/features/chat/subsystemLoad.ts`
- [ ] `rtk git mv apps/web/features/chat/scene/subsystemLoad.test.ts apps/web/features/chat/subsystemLoad.test.ts`
- [ ] In the moved `subsystemLoad.ts`, fix the relative imports (now one directory shallower):
      - `import type { Pipeline } from "../../../domain";` → `import type { Pipeline } from "../../domain";`
      - `import { resolveEventOwner } from "../../subsystems/components/SubsystemWeb/particle-mapping";` → `import { resolveEventOwner } from "../subsystems/components/SubsystemWeb/particle-mapping";`
      - `import type { RunView } from "../../runs/run";` → `import type { RunView } from "../runs/run";`
- [ ] In the moved `subsystemLoad.test.ts`, fix: `import type { Pipeline } from "../../../domain";` → `"../../domain"`; `import type { RunView } from "../../runs/run";` → `"../runs/run"`; the `./subsystemLoad` import stays.
- [ ] Retarget the two remaining scene importers (both die in Task 14, but must compile now):
      - `apps/web/features/chat/scene/CosmicScene.tsx`: `import { activeRunsBySubsystem } from "./subsystemLoad";` → `from "../subsystemLoad";`
      - `apps/web/features/chat/scene/orbitFieldLayer.ts`: `import { MAX_ORBITERS } from "./subsystemLoad";` → `from "../subsystemLoad";`
- [ ] Confirm no other file imports the old path: `rtk grep -rn "scene/subsystemLoad\|\./subsystemLoad" apps/web/features/chat/scene` → nothing (prose mentions in comments are fine; no import statements may remain).
- [ ] Run checks: `rtk pnpm check:lint && rtk pnpm check:types && rtk pnpm test`.
- [ ] Commit:
      ```bash
      rtk git add apps/web/features/chat/subsystemLoad.ts apps/web/features/chat/subsystemLoad.test.ts apps/web/features/chat/scene/subsystemLoad.ts apps/web/features/chat/scene/subsystemLoad.test.ts apps/web/features/chat/scene/CosmicScene.tsx apps/web/features/chat/scene/orbitFieldLayer.ts
      rtk git commit -m "refactor(chat): move activeRunsBySubsystem out of scene/ ahead of deletion"
      ```

---

### Task 3: Immersive bundle foundation — deps, `canMountWebGL`, `orbState`, `ellipseLayout`

Lay the foundation every other immersive task builds on: add `three` to the DS package, port the WebGL-capability guard, define the shared `OrbState`/`ORB_MOTION`/`ORB_STATE(_COLOR)` tables, and the pure `ellipseLayout` fn (TDD). Nothing here touches `index.ts` — the barrel is assembled once in Task 11.

**Parallel-safe:** no (adds `three` to `libs/design-system/package.json` + `pnpm install` — must land before Tasks 4/8/9/10 which import `three`). Rough size: M.

**Files:**
- Modify: `libs/design-system/package.json` (add `three` dep + `@types/three` dev dep)
- Create: `libs/design-system/src/immersive/canMountWebGL.ts`, `libs/design-system/src/immersive/canMountWebGL.test.ts`
- Create: `libs/design-system/src/immersive/orbState.ts`, `libs/design-system/src/immersive/orbState.test.ts`
- Create: `libs/design-system/src/immersive/ellipseLayout.ts`, `libs/design-system/src/immersive/ellipseLayout.test.ts`

**Interfaces:**
- Produces: `canMountWebGL()`, the `orbState.ts` exports (`OrbState`, `OrbMotion`, `ORB_MOTION`, `OrbStateStyle`, `ORB_STATE`, `ORB_STATE_COLOR`), and `ellipseLayout(w,h,count,insets)` → `EllipseLayout` (see shared contracts).
- Consumes: nothing.

Steps:

- [ ] Add deps to `libs/design-system/package.json`: under `dependencies` add `"three": "^0.185.1"`; add a `devDependencies` block with `"@types/three": "^0.185.0"`. Then `rtk pnpm install`.
- [ ] Create `canMountWebGL.ts` — port verbatim from `apps/web/features/chat/scene/canMountWebGL.ts`:
      ```ts
      /**
       * `true` only where a real WebGL context can be created. jsdom (component tests)
       * and GPU-less environments return `false`, so an `Orb` renders its DOM root but
       * never constructs a `WebGLRenderer` there — a quiet no-op, never a crash. Read
       * once and cached.
       */
      let cached: boolean | null = null;

      export function canMountWebGL(): boolean {
        if (cached !== null) return cached;
        if (typeof document === "undefined" || typeof window === "undefined") {
          cached = false;
          return cached;
        }
        const w = window as unknown as {
          WebGL2RenderingContext?: unknown;
          WebGLRenderingContext?: unknown;
        };
        const hasWebGLGlobals =
          typeof w.WebGL2RenderingContext !== "undefined" ||
          typeof w.WebGLRenderingContext !== "undefined";
        if (!hasWebGLGlobals) {
          cached = false;
          return cached;
        }
        try {
          const canvas = document.createElement("canvas");
          cached = Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
        } catch {
          cached = false;
        }
        return cached;
      }

      /** Test seam — reset the memoized capability read. */
      export function resetCanMountWebGLCache(): void {
        cached = null;
      }
      ```
- [ ] Create `canMountWebGL.test.ts`:
      ```ts
      import { afterEach, describe, expect, it } from "vitest";
      import { canMountWebGL, resetCanMountWebGLCache } from "./canMountWebGL";

      afterEach(() => resetCanMountWebGLCache());

      describe("canMountWebGL", () => {
        it("returns false under jsdom (no real WebGL context)", () => {
          expect(canMountWebGL()).toBe(false);
        });

        it("memoizes the first read", () => {
          const first = canMountWebGL();
          expect(canMountWebGL()).toBe(first);
        });
      });
      ```
- [ ] Create `orbState.ts` — port `ORB_MOTION` verbatim; add the chrome-color + live tables (exact hexes from the spec, mirroring ZT/DS tokens):
      ```ts
      /**
       * The immersive orb's state vocabulary (English). `state` selects the orb's
       * MOTION (amplitude / noise speed / glow / breathing) and its CHROME color
       * (halo, ping, contact shadow, status label, live connector). The orb BODY color
       * is the caller-supplied identity `hex` — never this palette.
       *
       * `ORB_MOTION` is ported verbatim from the Velín-D prototype (`velin-d-orb.jsx`).
       * `ORB_STATE_COLOR` mirrors the ZT / DS state tokens (idle=foreground-faint,
       * working=run, report=ok, await=warn, incident=bad, thinking=accent) as raw hex,
       * because these feed WebGL/canvas/SVG consumers that can't take a CSS var.
       */
      export type OrbState = "idle" | "working" | "report" | "await" | "incident" | "thinking";

      export interface OrbMotion {
        amp: number;
        speed: number;
        glow: number;
        breath: number;
      }

      export const ORB_MOTION: Record<OrbState, OrbMotion> = {
        idle: { amp: 0.05, speed: 0.18, glow: 0.5, breath: 1.0 },
        thinking: { amp: 0.17, speed: 0.95, glow: 0.82, breath: 0.7 },
        working: { amp: 0.15, speed: 0.85, glow: 0.78, breath: 0.75 },
        report: { amp: 0.085, speed: 0.42, glow: 0.68, breath: 0.9 },
        await: { amp: 0.05, speed: 0.16, glow: 0.6, breath: 1.35 },
        incident: { amp: 0.02, speed: 0.05, glow: 0.5, breath: 0.14 },
      };

      export const ORB_STATE_COLOR: Record<OrbState, string> = {
        idle: "#66737f",
        working: "#7aa5f8",
        report: "#3fcf8e",
        await: "#f0b429",
        incident: "#ff6b6b",
        thinking: "#5b8def",
      };

      export interface OrbStateStyle {
        color: string;
        live: boolean;
      }

      /** `live` = animated chrome (halo pulse, contact-shadow breathe, connector dash). */
      export const ORB_STATE: Record<OrbState, OrbStateStyle> = {
        idle: { color: ORB_STATE_COLOR.idle, live: false },
        working: { color: ORB_STATE_COLOR.working, live: true },
        report: { color: ORB_STATE_COLOR.report, live: true },
        await: { color: ORB_STATE_COLOR.await, live: true },
        incident: { color: ORB_STATE_COLOR.incident, live: true },
        thinking: { color: ORB_STATE_COLOR.thinking, live: true },
      };
      ```
- [ ] Create `orbState.test.ts`:
      ```ts
      import { describe, expect, it } from "vitest";
      import { ORB_MOTION, ORB_STATE, ORB_STATE_COLOR, type OrbState } from "./orbState";

      const STATES: OrbState[] = ["idle", "working", "report", "await", "incident", "thinking"];

      describe("orbState tables", () => {
        it("defines motion, color and live for every state", () => {
          for (const s of STATES) {
            expect(ORB_MOTION[s]).toBeDefined();
            expect(ORB_STATE_COLOR[s]).toMatch(/^#[0-9a-f]{6}$/i);
            expect(ORB_STATE[s].color).toBe(ORB_STATE_COLOR[s]);
          }
        });

        it("marks idle as the only non-live state", () => {
          expect(ORB_STATE.idle.live).toBe(false);
          for (const s of STATES.filter((x) => x !== "idle")) {
            expect(ORB_STATE[s].live).toBe(true);
          }
        });

        it("keeps the prototype's idle motion values", () => {
          expect(ORB_MOTION.idle).toEqual({ amp: 0.05, speed: 0.18, glow: 0.5, breath: 1.0 });
        });
      });
      ```
- [ ] TDD `ellipseLayout` — write `ellipseLayout.test.ts` FIRST (it fails to compile: no impl yet), run `rtk pnpm test` to see it red, then implement:
      ```ts
      // ellipseLayout.test.ts
      import { describe, expect, it } from "vitest";
      import { ellipseLayout } from "./ellipseLayout";

      const insets = { left: 0, right: 0, bottom: 0 };

      describe("ellipseLayout", () => {
        it("returns one position per node, first at 12 o'clock", () => {
          const l = ellipseLayout(1200, 720, 8, insets);
          expect(l.positions).toHaveLength(8);
          // node 0 is at angle -PI/2 → directly above center (x≈cx, y = cy - radiusY)
          expect(l.positions[0]!.x).toBeCloseTo(l.cx, 5);
          expect(l.positions[0]!.y).toBeCloseTo(l.cy - l.radiusY, 5);
        });

        it("places nodes clockwise (node 2 of 8 is at 3 o'clock, right of center)", () => {
          const l = ellipseLayout(1200, 720, 8, insets);
          expect(l.positions[2]!.x).toBeCloseTo(l.cx + l.radiusX, 5);
          expect(l.positions[2]!.y).toBeCloseTo(l.cy, 5);
        });

        it("clamps node diameter into 48..76 and core into 96..264", () => {
          const small = ellipseLayout(400, 300, 8, insets);
          expect(small.nodeD).toBeGreaterThanOrEqual(48);
          expect(small.nodeD).toBeLessThanOrEqual(76);
          expect(small.coreSize).toBeGreaterThanOrEqual(96);
          expect(small.coreSize).toBeLessThanOrEqual(264);
        });

        it("offsets cx right when the left inset (tasks panel) is larger than the right", () => {
          const l = ellipseLayout(1200, 720, 8, { left: 300, right: 0, bottom: 0 });
          expect(l.cx).toBeGreaterThan(1200 / 2);
        });

        it("shrinks the usable height by the bottom reserve (chat dock)", () => {
          const tall = ellipseLayout(1200, 720, 8, { left: 0, right: 0, bottom: 0 });
          const docked = ellipseLayout(1200, 720, 8, { left: 0, right: 0, bottom: 260 });
          expect(docked.radiusY).toBeLessThan(tall.radiusY);
        });

        it("never returns a radiusY below the 84 floor", () => {
          const l = ellipseLayout(1200, 260, 8, { left: 0, right: 0, bottom: 240 });
          expect(l.radiusY).toBeGreaterThanOrEqual(84);
        });
      });
      ```
      ```ts
      // ellipseLayout.ts — ports the responsive ellipse math from velin-d-map.jsx (VcMapD)
      export interface EllipseInsets {
        /** Left reserve (e.g. the tasks panel width). */
        left: number;
        /** Right reserve (e.g. a floating dock). */
        right: number;
        /** Bottom reserve subtracted from usable height (e.g. the chat dock). */
        bottom: number;
      }

      export interface OrbPosition {
        x: number;
        y: number;
      }

      export interface EllipseLayout {
        cx: number;
        cy: number;
        radiusX: number;
        radiusY: number;
        nodeD: number;
        coreSize: number;
        positions: OrbPosition[];
      }

      const clamp = (min: number, v: number, max: number): number => Math.max(min, Math.min(max, v));

      /**
       * Responsive ellipse geometry for the orb map. Pure — no DOM. `count` nodes are
       * spread evenly from 12 o'clock clockwise (`angle_i = -PI/2 + i * 2PI / count`).
       * On low canvases the core and nodes shrink so the orbit fits above the bottom
       * reserve without overlap. Ported from `velin-d-map.jsx`'s `VcMapD` layout block.
       */
      export function ellipseLayout(
        w: number,
        h: number,
        count: number,
        insets: EllipseInsets,
      ): EllipseLayout {
        const leftInset = clamp(0, insets.left, w * 0.32 > 336 ? 336 : w * 0.32);
        const rightInset = clamp(0, insets.right, w * 0.1 > 108 ? 108 : w * 0.1);
        const cx = w / 2 + (leftInset - rightInset) / 2;
        const usableH = Math.max(220, h - insets.bottom);

        const nodeD = clamp(48, usableH * 0.2, 76);
        const topPad = nodeD / 2 + 16;
        const bottomExtent = nodeD / 2 + 54; // 10 gap + 44 two-line label
        const radiusY = Math.max(84, (usableH - topPad - bottomExtent) / 2);
        const cy = topPad + radiusY;
        const coreSize = clamp(96, radiusY * 1.5, 264);
        const radiusX = clamp(150, (w - leftInset - rightInset) / 2 - (nodeD / 2 + 64), 340);

        const positions: OrbPosition[] = [];
        for (let i = 0; i < count; i++) {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
          positions.push({ x: cx + radiusX * Math.cos(a), y: cy + radiusY * Math.sin(a) });
        }
        return { cx, cy, radiusX, radiusY, nodeD, coreSize, positions };
      }
      ```
      Note: the prototype hardcodes its reserves (`leftInset = Math.min(336, Math.max(0, w*0.32))`) because it has no callers; this DS fn generalizes them into `insets` so the app can pass the real tasks-panel/dock reserves. Implement the insets-based code above exactly as written — the caller's `insets.left`/`insets.right` are clamped into the prototype's `[0, min(336, w*0.32)]` / `[0, min(108, w*0.1)]` envelopes. Do NOT transcribe the prototype's width-only formula literally (it ignores `insets` and would break the cx-offset test).
- [ ] Run checks: `rtk pnpm check:lint && rtk pnpm check:types && rtk pnpm test`.
- [ ] Commit:
      ```bash
      rtk git add libs/design-system/package.json pnpm-lock.yaml libs/design-system/src/immersive/canMountWebGL.ts libs/design-system/src/immersive/canMountWebGL.test.ts libs/design-system/src/immersive/orbState.ts libs/design-system/src/immersive/orbState.test.ts libs/design-system/src/immersive/ellipseLayout.ts libs/design-system/src/immersive/ellipseLayout.test.ts
      rtk git commit -m "feat(ds): immersive bundle foundation — three dep, canMountWebGL, orbState, ellipseLayout"
      ```

---

### Task 4: `Orb` — per-orb WebGL wireframe icosahedron

Port `createZOrb` + `ZOrb3D` (`velin-d-orb.jsx`) into a DS component: displaced-icosahedron wire mesh + glow shell, exponential param easing, breathing, rotation, `prefers-reduced-motion`, full dispose. jsdom-safe via `canMountWebGL`.

**Parallel-safe:** yes, with Tasks 5 and 6 (and with 7 once 6 has landed) — disjoint folders; none touch `index.ts`. Depends on Task 3 (`three` dep + `orbState` + `canMountWebGL`). Rough size: L (shaders + rAF + dispose).

**Files:**
- Create: `libs/design-system/src/immersive/Orb/orbSimplex.ts` (the GLSL snoise string), `libs/design-system/src/immersive/Orb/createOrb.ts` (vanilla-three controller), `libs/design-system/src/immersive/Orb/Orb.tsx`, `libs/design-system/src/immersive/Orb/Orb.test.tsx`, `libs/design-system/src/immersive/Orb/Orb.stories.tsx`

**Interfaces:**
- Produces:
  ```ts
  export enum OrbTestId { Root = "orb-root" }
  export interface OrbMotionOverrides { amp?: number; speed?: number; glow?: number; breath?: number }
  export interface OrbProps {
    diameter?: number;       // target sphere diameter in px (canvas = diameter / 0.8)
    hex?: string;            // identity color
    state?: OrbState;        // selects ORB_MOTION target
    detail?: number;         // IcosahedronGeometry subdivision (nodes 1, core 4)
    antialias?: boolean;
    motionOverrides?: OrbMotionOverrides; // Storybook "vrnění" knobs
    ref?: React.Ref<HTMLDivElement>;
  }
  export function Orb(props: OrbProps): JSX.Element;
  export interface OrbController { setTarget(hex: string, state: OrbState, overrides?: OrbMotionOverrides): void; resize(): void; dispose(): void }
  export function createOrb(container: HTMLElement, opts: {...}): OrbController;
  ```
- Consumes: `OrbState`, `ORB_MOTION` (Task 3), `canMountWebGL` (Task 3), `three`.

Steps:

- [ ] Create `Orb/orbSimplex.ts` — the GLSL 3D simplex-noise source (Ashima/IQ snoise), transcribed exactly from `ORB_SIMPLEX` in `velin-d-orb.jsx`:
      ```ts
      /** GLSL 3D simplex noise (snoise) — prepended to the wire vertex shader. */
      export const ORB_SIMPLEX = `
      vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
      vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
      vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
      vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
      float snoise(vec3 v){
        const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
        vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
        vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g;
        vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
        vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
        i=mod289(i);
        vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
        float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
        vec4 j=p-49.0*floor(p*ns.z*ns.z);
        vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
        vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
        vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
        vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
        vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
        vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
        vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
        p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
        vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
        return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
      }`;
      ```
- [ ] Create `Orb/createOrb.ts` — the vanilla-three controller, ported from `createZOrb` (Czech comments translated; geometry/material dispose added per the repo perf contract; `motionOverrides` merged over the state's motion target):
      ```ts
      import * as THREE from "three";
      import { ORB_MOTION, type OrbMotion, type OrbState } from "../orbState";
      import type { OrbMotionOverrides } from "./Orb";
      import { ORB_SIMPLEX } from "./orbSimplex";

      export interface CreateOrbOptions {
        hex?: string;
        state?: OrbState;
        detail?: number;
        antialias?: boolean;
        motionOverrides?: OrbMotionOverrides;
      }

      export interface OrbController {
        setTarget(hex: string, state: OrbState, overrides?: OrbMotionOverrides): void;
        resize(): void;
        dispose(): void;
      }

      /**
       * A single WebGL orb: wireframe icosahedron displaced along its normals by 3D
       * simplex noise + fresnel alpha, wrapped in a soft additive glow shell. One
       * instance = one canvas (own renderer/scene/camera/rAF). Color = identity;
       * motion (amplitude / noise speed / glow / breathing) = state. All parameters
       * ease exponentially toward their target (~95 % in 0.6 s).
       */
      export function createOrb(container: HTMLElement, opts: CreateOrbOptions): OrbController {
        const detail = opts.detail ?? 3;
        const reduce =
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        const renderer = new THREE.WebGLRenderer({
          antialias: Boolean(opts.antialias),
          alpha: true,
          powerPreference: "low-power",
        });
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);
        renderer.domElement.style.display = "block";
        renderer.domElement.style.pointerEvents = "none";
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
        camera.position.set(0, 0, 3.63); // sphere fills ~80 % of the canvas height

        const grp = new THREE.Group();
        scene.add(grp);

        const uniforms = {
          uTime: { value: Math.random() * 40 },
          uAmp: { value: ORB_MOTION.idle.amp },
          uSpeed: { value: ORB_MOTION.idle.speed },
          uColor: { value: new THREE.Color(opts.hex ?? "#5b8def") },
          uGlow: { value: ORB_MOTION.idle.glow },
        };

        const wireGeometry = new THREE.IcosahedronGeometry(1, detail);
        const wireMat = new THREE.ShaderMaterial({
          uniforms,
          transparent: true,
          depthWrite: false,
          wireframe: true,
          blending: THREE.NormalBlending,
          vertexShader:
            ORB_SIMPLEX +
            `
            uniform float uTime; uniform float uAmp; uniform float uSpeed;
            varying float vFres;
            void main(){
              vec3 dir = normalize(position);
              float t = uTime * uSpeed;
              float n1 = snoise(dir * 1.7 + vec3(0.0,0.0,t));
              float n2 = snoise(dir * 3.4 + vec3(t*0.7,0.0,0.0));
              float disp = (n1*0.72 + n2*0.28) * uAmp;
              vec3 p = position + normal * disp;
              vec4 mv = modelViewMatrix * vec4(p,1.0);
              vec3 N = normalize(normalMatrix * normal);
              vec3 V = normalize(-mv.xyz);
              vFres = pow(1.0 - abs(dot(N,V)), 1.8);
              gl_Position = projectionMatrix * mv;
            }`,
          fragmentShader: `
            uniform vec3 uColor; varying float vFres;
            void main(){ float a = mix(0.6,0.95,clamp(vFres,0.0,1.0)); gl_FragColor = vec4(uColor,a); }`,
        });
        grp.add(new THREE.Mesh(wireGeometry, wireMat));

        const glowGeometry = new THREE.IcosahedronGeometry(1.12, 2);
        const glowMat = new THREE.ShaderMaterial({
          uniforms,
          transparent: true,
          depthWrite: false,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
          vertexShader: `
            varying float vFres;
            void main(){
              vec4 mv = modelViewMatrix * vec4(position,1.0);
              vec3 N = normalize(normalMatrix * normal);
              vec3 V = normalize(-mv.xyz);
              vFres = pow(1.0 - abs(dot(N,V)), 3.2);
              gl_Position = projectionMatrix * mv;
            }`,
          fragmentShader: `
            uniform vec3 uColor; uniform float uGlow; varying float vFres;
            void main(){ gl_FragColor = vec4(uColor, vFres * uGlow); }`,
        });
        grp.add(new THREE.Mesh(glowGeometry, glowMat));

        // Live vs target state — both mutated in place (no per-frame allocation).
        const targetColor = new THREE.Color(opts.hex ?? "#5b8def");
        const initial: OrbMotion = {
          ...(ORB_MOTION[opts.state ?? "idle"] ?? ORB_MOTION.idle),
          ...opts.motionOverrides,
        };
        const tgt: OrbMotion = { ...initial };
        const cur: OrbMotion = { ...initial };

        function setTarget(hex: string, state: OrbState, overrides?: OrbMotionOverrides): void {
          targetColor.set(hex);
          const m = ORB_MOTION[state] ?? ORB_MOTION.idle;
          tgt.amp = overrides?.amp ?? m.amp;
          tgt.speed = overrides?.speed ?? m.speed;
          tgt.glow = overrides?.glow ?? m.glow;
          tgt.breath = overrides?.breath ?? m.breath;
        }

        const TAU = 0.2; // easing time constant — ~95 % of the way in 0.6 s
        let last = performance.now();
        let simT = uniforms.uTime.value;
        let raf: number | null = null;

        function resize(): void {
          const w = container.clientWidth || 1;
          const h = container.clientHeight || 1;
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        }
        resize();

        function frame(now: number): void {
          let dt = (now - last) / 1000;
          last = now;
          dt = Math.min(dt, 0.05);
          const k = 1 - Math.exp(-dt / TAU);

          // 7 s breathing sine, 0..1.
          const breathPhase = (now / 1000) * ((Math.PI * 2) / 7);
          const breath = Math.sin(breathPhase) * 0.5 + 0.5;

          cur.amp = cur.amp + (tgt.amp - cur.amp) * k;
          cur.speed = cur.speed + (tgt.speed - cur.speed) * k;
          cur.glow = cur.glow + (tgt.glow - cur.glow) * k;
          cur.breath = cur.breath + (tgt.breath - cur.breath) * k;

          uniforms.uColor.value.lerp(targetColor, k);
          simT += dt * (reduce ? 0 : 1); // reduced motion: freeze noise time
          uniforms.uTime.value = simT;
          uniforms.uSpeed.value = cur.speed;
          uniforms.uAmp.value = cur.amp * (1 + (breath - 0.5) * 0.28 * cur.breath);
          uniforms.uGlow.value = cur.glow * (0.82 + breath * 0.18);

          const scale = 1 + (breath - 0.5) * 0.03 * cur.breath;
          grp.scale.setScalar(scale);

          if (!reduce) {
            grp.rotation.y += dt * 0.16;
            grp.rotation.x += dt * 0.07;
            grp.rotation.z = Math.sin((now / 1000) * 0.12) * 0.09;
          }
          renderer.render(scene, camera);
          raf = requestAnimationFrame(frame);
        }
        raf = requestAnimationFrame(frame);

        return {
          setTarget,
          resize,
          dispose(): void {
            if (raf !== null) cancelAnimationFrame(raf);
            // Repo perf contract: dispose EVERY three.js resource (the prototype
            // only disposed the renderer — geometries/materials are added here).
            wireGeometry.dispose();
            glowGeometry.dispose();
            wireMat.dispose();
            glowMat.dispose();
            renderer.dispose();
            renderer.forceContextLoss(); // free the GPU context slot now, not at GC
            renderer.domElement.parentNode?.removeChild(renderer.domElement);
          },
        };
      }
      ```
      **Perf:** the `frame` body allocates nothing (all state mutated in place) — keep it that way.
- [ ] Create `Orb/Orb.tsx` — the React wrapper (React 19 ref-as-prop, no `forwardRef`), ported from `ZOrb3D`:
      ```tsx
      import { useEffect, useRef } from "react";
      import { canMountWebGL } from "../canMountWebGL";
      import type { OrbState } from "../orbState";
      import { createOrb, type OrbController } from "./createOrb";

      export enum OrbTestId {
        Root = "orb-root",
      }

      export interface OrbMotionOverrides {
        amp?: number;
        speed?: number;
        glow?: number;
        breath?: number;
      }

      export interface OrbProps {
        /** Target sphere diameter in px. Canvas is `diameter / 0.8` to fit the glow. */
        diameter?: number;
        /** Identity color of the orb body. */
        hex?: string;
        /** Conversational/subsystem state — selects the {@link ORB_MOTION} target. */
        state?: OrbState;
        /** IcosahedronGeometry subdivision — nodes use 1, the core 4. */
        detail?: number;
        antialias?: boolean;
        /** Storybook "vrnění" overrides pushed over the state's motion. */
        motionOverrides?: OrbMotionOverrides;
        ref?: React.Ref<HTMLDivElement>;
      }

      /**
       * A single WebGL wireframe orb (own renderer/scene/camera/rAF). Sizing-API
       * exception: takes a numeric px `diameter` (see immersive bundle docs) because
       * this is continuous canvas geometry. Under jsdom / no-GPU (`canMountWebGL()` is
       * false) it renders only its positioned root div — a quiet no-op.
       */
      export function Orb({
        diameter = 72,
        hex = "#5b8def",
        state = "idle",
        detail = 3,
        antialias = false,
        motionOverrides,
        ref,
      }: OrbProps) {
        const mountRef = useRef<HTMLDivElement | null>(null);
        const apiRef = useRef<OrbController | null>(null);
        const canvasPx = Math.round(diameter / 0.8);

        useEffect(() => {
          if (!mountRef.current || !canMountWebGL()) return;
          apiRef.current = createOrb(mountRef.current, { hex, state, detail, antialias, motionOverrides });
          return () => {
            apiRef.current?.dispose();
            apiRef.current = null;
          };
          // Mount-once; live prop changes flow through the setTarget effect below.
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);

        // motionOverrides is in the deps so Storybook knobs stay live after mount;
        // callers should pass a stable/memoized object (or omit it) to avoid
        // re-running on every render.
        useEffect(() => {
          apiRef.current?.setTarget(hex, state, motionOverrides);
        }, [hex, state, motionOverrides]);

        return (
          <div
            data-testid={OrbTestId.Root}
            ref={(node) => {
              mountRef.current = node;
              if (typeof ref === "function") ref(node);
              else if (ref) ref.current = node;
            }}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: canvasPx,
              height: canvasPx,
              pointerEvents: "none",
              zIndex: 2,
            }}
          />
        );
      }
      ```
- [ ] Create `Orb/Orb.test.tsx` (jsdom, no WebGL — asserts the DOM no-op path + sizing):
      ```tsx
      import { render, screen } from "@testing-library/react";
      import { createRef } from "react";
      import { describe, expect, it } from "vitest";
      import { Orb, OrbTestId } from "./Orb";

      describe("Orb", () => {
        it("renders its positioned root (quiet no-op without WebGL)", () => {
          render(<Orb diameter={72} />);
          const root = screen.getByTestId(OrbTestId.Root);
          expect(root).toBeInTheDocument();
          // canvas = diameter / 0.8 = 90px
          expect(root).toHaveStyle({ width: "90px", height: "90px" });
        });

        it("does not mount a canvas under jsdom", () => {
          render(<Orb />);
          expect(screen.getByTestId(OrbTestId.Root).querySelector("canvas")).toBeNull();
        });

        it("forwards ref as a prop (React 19)", () => {
          const ref = createRef<HTMLDivElement>();
          render(<Orb ref={ref} />);
          expect(ref.current).toBe(screen.getByTestId(OrbTestId.Root));
        });
      });
      ```
      (`querySelector("canvas")` here asserts *absence* of a node the component doesn't own — permitted, it is not selecting one of our test-id'd parts.)
- [ ] Create `Orb/Orb.stories.tsx` — exactly `Overview` + `Playground`. `Overview` renders the six states in a row (each `Orb` in a sized relative wrapper). `Playground` wires `argTypes`: `state` (select, all six `OrbState`), `detail` (range 0–5, labelled "polygon count"), `diameter` (range 40–280), `hex` (color), `antialias` (boolean), and motion knobs `motionOverrides.amp/speed/glow/breath` (ranges) — expose them as flat args mapped into `motionOverrides` in the render fn. Meta `title: "Immersive/Orb"`.
- [ ] Run checks: `rtk pnpm check:lint && rtk pnpm check:types && rtk pnpm test`.
- [ ] Commit:
      ```bash
      rtk git add libs/design-system/src/immersive/Orb
      rtk git commit -m "feat(ds): immersive Orb — ported WebGL wireframe icosahedron + shaders"
      ```

---

### Task 5: `OrbitField` — faux-3D orbiting task dots

Port `VcOrbitField` + `vcRand` (`velin-d-map.jsx`): a seeded PRNG lays out N dots on inclined orbits; a rAF loop projects them to 2D with depth-driven scale/opacity/blur/z; reduced-motion freezes at t=0.

**Parallel-safe:** yes, with Tasks 4 and 6 (and with 7 once 6 has landed). Depends on Task 3 (bundle exists) only for co-location — no `three`. Rough size: M.

**Files:**
- Create: `libs/design-system/src/immersive/seededRandom.ts`, `libs/design-system/src/immersive/seededRandom.test.ts`
- Create: `libs/design-system/src/immersive/OrbitField/OrbitField.tsx`, `OrbitField.test.tsx`, `OrbitField.stories.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function seededRandom(seed: string): () => number; // deterministic 0..1 PRNG (port of vcRand)
  export enum OrbitFieldTestId { Root = "orbit-field-root", Dot = "orbit-field-dot" }
  export interface OrbitFieldProps { seed: string; color: string; count: number; baseRadius: number }
  export function OrbitField(props: OrbitFieldProps): JSX.Element;
  ```
- Consumes: `seededRandom`.

Steps:

- [ ] Create `seededRandom.ts` — port `vcRand` verbatim (FNV-1a seed + mulberry-ish step), typed:
      ```ts
      /**
       * Deterministic 0..1 PRNG seeded from a string (stable orbits across renders).
       * Ported verbatim from `velin-d-map.jsx`'s `vcRand`.
       */
      export function seededRandom(seed: string): () => number {
        let h = 2166136261;
        for (let i = 0; i < seed.length; i++) {
          h ^= seed.charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
        return () => {
          h += 0x6d2b79f5;
          let t = h;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }
      ```
- [ ] Create `seededRandom.test.ts`: same seed → identical sequence; different seed → different first value; all outputs in `[0, 1)`.
- [ ] TDD `OrbitField` — write `OrbitField.test.tsx` first (jsdom; the rAF projection is a no-op assertion target, so test structure/count/reduced-motion):
      ```tsx
      import { render, screen } from "@testing-library/react";
      import { describe, expect, it } from "vitest";
      import { OrbitField, OrbitFieldTestId } from "./OrbitField";

      describe("OrbitField", () => {
        it("renders one dot per count", () => {
          render(<OrbitField seed="forge" color="#7aa5f8" count={4} baseRadius={40} />);
          expect(screen.getAllByTestId(OrbitFieldTestId.Dot)).toHaveLength(4);
        });

        it("renders no dots for count 0", () => {
          render(<OrbitField seed="idle-sys" color="#66737f" count={0} baseRadius={40} />);
          expect(screen.queryByTestId(OrbitFieldTestId.Dot)).toBeNull();
        });

        it("is deterministic — same seed yields the same dot sizes", () => {
          const { unmount } = render(
            <OrbitField seed="scout" color="#3fcf8e" count={3} baseRadius={50} />,
          );
          const first = screen.getAllByTestId(OrbitFieldTestId.Dot).map((d) => d.style.width);
          unmount();
          render(<OrbitField seed="scout" color="#3fcf8e" count={3} baseRadius={50} />);
          const second = screen.getAllByTestId(OrbitFieldTestId.Dot).map((d) => d.style.width);
          expect(second).toEqual(first);
        });
      });
      ```
      Then implement `OrbitField.tsx` — port `VcOrbitField` (translate/strip all Czech comments per Global Constraint 1; use `useMemo` for the orbiter descriptors from `seededRandom(seed)`, `useRef<(HTMLSpanElement | null)[]>` for the dots, the rAF projection loop mutating `el.style.transform/opacity/filter/zIndex` in place, `prefers-reduced-motion` freeze at `t=0` with no rAF scheduled). Each dot span carries `data-testid={OrbitFieldTestId.Dot}`. Wrap in a `data-testid={OrbitFieldTestId.Root}` fragment host (`<span>` with `display:contents`) so the Root testid exists. Keep the radial-gradient + glow inline style verbatim. Guard array indexing for `noUncheckedIndexedAccess` (`const el = dots.current[i]; if (!el) continue;`). No per-frame allocation.
- [ ] Create `OrbitField.stories.tsx` — `Overview` (a few fields at different counts/colors inside sized relative wrappers) + `Playground` (`argTypes`: `count` range 0–6, `color`, `baseRadius`, `seed` text). Meta `title: "Immersive/OrbitField"`.
- [ ] Run checks; fix.
- [ ] Commit:
      ```bash
      rtk git add libs/design-system/src/immersive/seededRandom.ts libs/design-system/src/immersive/seededRandom.test.ts libs/design-system/src/immersive/OrbitField
      rtk git commit -m "feat(ds): immersive OrbitField + seededRandom — faux-3D orbiting task dots"
      ```

---

### Task 6: `ConnectorLayer` — full-bleed SVG beziers with live dash-pulse

Port `VcConnectors` (`velin-d-map.jsx`): one quadratic bezier center→node (bend 0.08); a base translucent stroke always, plus a colored dashed overlay animated (`vcDash`) when the node is live. Owns the `vcDash` keyframe injection.

**Parallel-safe:** yes, with Tasks 4 and 5 (Task 7 depends on this task's `ensureImmersiveCss` — it may only start after this lands). Depends on Task 3 (bundle). Rough size: S.

**Files:**
- Create: `libs/design-system/src/immersive/immersive.css.ts` (a `<style>`-injection helper for the shared CSS keyframes, injected once), `libs/design-system/src/immersive/ConnectorLayer/ConnectorLayer.tsx`, `ConnectorLayer.test.tsx`, `ConnectorLayer.stories.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function ensureImmersiveCss(): void; // idempotent injection of vcDash/vcHalo/vcRing/vcShadow/vcFloat/flare keyframes + reduced-motion reset
  export enum ConnectorLayerTestId { Root = "connector-layer-root", Connector = "connector-layer-connector" }
  export interface ConnectorNode { id: string; x: number; y: number; color: string; live: boolean }
  export interface ConnectorLayerProps { center: { x: number; y: number }; nodes: ConnectorNode[] }
  export function ConnectorLayer(props: ConnectorLayerProps): JSX.Element;
  ```
- Consumes: `ensureImmersiveCss` (this task defines it — the single source for ALL immersive CSS keyframes, so later tasks import it rather than re-injecting).

Steps:

- [ ] Create `immersive.css.ts` — one idempotent injector porting the union of the prototype's `vc-css-d` keyframes needed by the bundle. Include exactly: `vcSpin`, `vcShadow`, `vcRing`, `vcHalo`, `vcFloat`, `vcDash`, `vcFlareFly`, `vcFlareBurstRing`, `vcFlareBurstCore`, `vcFlareLaunch`, and the `@media (prefers-reduced-motion: reduce) { [class^="im-"], .im-anim { animation: none !important } }` reset. Guard on `typeof document === "undefined"` (SSR/jsdom) and a `data-immersive-css` marker so it injects once. Copy each keyframe body verbatim from `velin-d-map.jsx` (rename the CSS keyframe identifiers can stay `vc*`? No — English-only: rename keyframes to `im*` — `imDash`, `imHalo`, `imRing`, `imShadow`, `imFloat`, `imFlareFly`, `imFlareBurstRing`, `imFlareBurstCore`, `imFlareLaunch`, `imSpin` — and reference those names in every component). Provide a `resetImmersiveCss()` test seam that removes the injected node.
- [ ] Create `ConnectorLayer.tsx` — port `VcConnectors` (translate/strip all Czech comments per Global Constraint 1). Full-bleed `<svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none", zIndex:1 }} data-testid={ConnectorLayerTestId.Root}>`. Call `ensureImmersiveCss()` in a `useEffect`. For each node compute `mx = (cx + n.x)/2 + (n.y - cy)*0.08`, `my = (cy + n.y)/2 - (n.x - cx)*0.08`, `d = \`M ${cx} ${cy} Q ${mx} ${my} ${n.x} ${n.y}\``. Render the base `<path stroke="rgba(255,255,255,0.09)" strokeWidth="1">` always with `data-testid={\`${ConnectorLayerTestId.Connector}-${n.id}\`}`, and when `n.live` an overlay `<path stroke={n.color} strokeWidth="1.4" strokeOpacity="0.5" strokeDasharray="2 10" strokeLinecap="round" style={{ animation: "imDash 3.2s linear infinite" }}>`. React 19 ref-as-prop if needed (not required here).
- [ ] Create `ConnectorLayer.test.tsx`: renders one base connector per node (`getAllByTestId` with the `Connector-` prefix, or select per id); a `live` node adds the dashed overlay (assert the live node's group has 2 paths — scope with `within` on the connector's parent `<g>` selected by test-id). Assert root has `toHaveAttribute("aria-hidden")` if you mark it decorative (recommended — add `aria-hidden="true"`).
- [ ] Create `ConnectorLayer.stories.tsx` — `Overview` (a center + a ring of mixed live/idle nodes) + `Playground` (`argTypes` for a couple of node toggles or a `liveCount` number). Meta `title: "Immersive/ConnectorLayer"`.
- [ ] Run checks; fix.
- [ ] Commit:
      ```bash
      rtk git add libs/design-system/src/immersive/immersive.css.ts libs/design-system/src/immersive/ConnectorLayer
      rtk git commit -m "feat(ds): immersive ConnectorLayer + shared keyframe injector"
      ```

---

### Task 7: `HandoffFlare` — comet + burst along an arc

Port `VcHandoffFlare` + `vcArcPath` (`velin-d-map.jsx`): a launch ring at the source, three comet dots on a CSS `offset-path` arc (bend 0.16), and an impact burst (core + ring) at the target. Fires `onDone` when its lifetime ends.

**Parallel-safe:** no — depends on Task 6 (imports `ensureImmersiveCss` / the `imFlare*` keyframes from Task 6's file). After Task 6 lands, parallel-safe with Tasks 4 and 5 only. Rough size: S/M.

**Files:**
- Create: `libs/design-system/src/immersive/HandoffFlare/arcPath.ts`, `arcPath.test.ts`, `libs/design-system/src/immersive/HandoffFlare/HandoffFlare.tsx`, `HandoffFlare.test.tsx`, `HandoffFlare.stories.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function arcPath(x1: number, y1: number, x2: number, y2: number, bend?: number): string;
  export enum HandoffFlareTestId { Root = "handoff-flare-root", Launch = "handoff-flare-launch", Comet = "handoff-flare-comet", BurstCore = "handoff-flare-burst-core", BurstRing = "handoff-flare-burst-ring" }
  export interface HandoffFlareProps {
    from: { x: number; y: number };
    to: { x: number; y: number };
    color?: string;
    durationMs?: number;   // default 1300 (comet flight); instance self-retires ~1.5s
    onDone?: () => void;
  }
  export function HandoffFlare(props: HandoffFlareProps): JSX.Element;
  ```
- Consumes: `ensureImmersiveCss` (Task 6), `arcPath`.

Steps:

- [ ] TDD `arcPath` — test first, then port `vcArcPath` (default `bend = 0.16`): `mx = (x1+x2)/2 + (y2-y1)*bend`, `my = (y1+y2)/2 - (x2-x1)*bend`, returns `\`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}\``. Tests: straight horizontal handoff bows off-axis (my ≠ midpoint y); returns a valid `M … Q … ` string; `bend=0` gives the plain midpoint control point.
- [ ] Create `HandoffFlare.tsx` — port `VcHandoffFlare` (translate/strip all Czech comments per Global Constraint 1) with `HANDOFF_COLOR = "#ffe066"` default. `useEffect` calls `ensureImmersiveCss()` and starts a `setTimeout(onDone, durationMs + 200)` (self-retire ~1.5s), cleared on unmount. Wrap parts in a `data-testid={HandoffFlareTestId.Root}` fragment host. Launch ring (`imFlareLaunch .5s`), the three comet dots (`13/10/7` px, `offsetPath: path('${d}')`, `imFlareFly ${durationMs/1000}s cubic-bezier(.3,0,.7,1) ${(i*0.07)}s forwards`) each with `data-testid={\`${HandoffFlareTestId.Comet}-${i}\`}`, the burst core (`imFlareBurstCore`) and burst ring (`imFlareBurstRing`). Copy all inline styles verbatim. `useMemo` the path `d`.
- [ ] Create `HandoffFlare.test.tsx`: renders launch + 3 comets + burst core + burst ring (`getAllByTestId(Comet-…)` → 3, others present); `onDone` fires after the timer (`vi.useFakeTimers()` + `vi.advanceTimersByTime`); default color applied when `color` omitted (assert an inline style contains `#ffe066` on the launch node selected by test-id).
- [ ] Create `HandoffFlare.stories.tsx` — `Overview` (a static flare between two fixed points in a sized box) + `Playground` (`argTypes`: `color`, `durationMs`, plus a "Replay" render that remounts with a key on a button click). Meta `title: "Immersive/HandoffFlare"`.
- [ ] Run checks; fix.
- [ ] Commit:
      ```bash
      rtk git add libs/design-system/src/immersive/HandoffFlare
      rtk git commit -m "feat(ds): immersive HandoffFlare — comet + burst along a CSS motion-path arc"
      ```

---

### Task 8: `OrbNode` — composed subsystem node

Port `VcNodeD` (`velin-d-map.jsx`): an `Orb` (identity `hex`, `detail=1`) with an icon overlay, a name + status row, and the chrome — contact shadow, `OrbitField`, halo ring, attention ping (await/incident/report only), and a seeded float animation. Colors from `ORB_STATE`.

**Parallel-safe:** no — depends on Task 4 (`Orb`) and Task 5 (`OrbitField`) interfaces. Parallel-safe **with Task 9** (disjoint folders). Rough size: M.

**Files:**
- Create: `libs/design-system/src/immersive/OrbNode/OrbNode.tsx`, `OrbNode.test.tsx`, `OrbNode.stories.tsx`

**Interfaces:**
- Produces:
  ```ts
  export enum OrbNodeTestId {
    Root = "orb-node-root", Orb = "orb-node-orb", Icon = "orb-node-icon",
    Label = "orb-node-label", Status = "orb-node-status", Halo = "orb-node-halo",
    Ping = "orb-node-ping", Shadow = "orb-node-shadow",
  }
  export interface OrbNodeProps {
    diameter: number; hex: string; state: OrbState;
    label: string; statusLabel: string; icon: React.ReactNode;
    activeCount: number; nodeId: string;      // seeds float + orbit
    onClick?: () => void; ref?: React.Ref<HTMLDivElement>;
  }
  export function OrbNode(props: OrbNodeProps): JSX.Element;
  ```
- Consumes: `Orb` (`../Orb/Orb`), `OrbitField` (`../OrbitField/OrbitField`), `ORB_STATE`/`OrbState` (`../orbState`), `seededRandom` (`../seededRandom`), `ensureImmersiveCss` (`../immersive.css`).

Steps:

- [ ] Create `OrbNode.tsx` — port `VcNodeD` (translate/strip all Czech comments per Global Constraint 1). Resolve `const st = ORB_STATE[state]`. Compute `floatCfg` via `useMemo` from `seededRandom(nodeId)` (`dur = (5 + r()*3).toFixed(1)`, `delay = (r()*4).toFixed(1)`). Structure (all inline styles as in the prototype, testids added):
      - Outer clickable `<div data-testid={OrbNodeTestId.Root}>` — render as a `<button>` for a11y (interactive), `onClick`, `aria-label={label}` (a11y checklist: interactive = button, has accessible name). Keep the flex-column layout + cursor.
      - Float wrapper `<div style={{ animation: \`imFloat ${floatCfg.dur}s ease-in-out -${floatCfg.delay}s infinite\`, … }}>`.
      - Contact shadow `<span data-testid={OrbNodeTestId.Shadow}>` (ellipse `D*0.86 × 11`, `${st.color}44` radial, blur 2px, `imShadow 4s` when `st.live` else `none`).
      - `<OrbitField seed={nodeId} color={st.color} count={activeCount} baseRadius={diameter/2 + 13} />`.
      - Halo `<span data-testid={OrbNodeTestId.Halo}>` (`D+16`, `1.5px solid ${st.color}`, shadow `0 0 16px ${st.color}55`, animation `imHalo ${state==="working"?3.4:2}s` when live else `none`, opacity `st.live ? undefined : 0.32`).
      - Ping `<span data-testid={OrbNodeTestId.Ping}>` rendered ONLY when `state === "await" || state === "incident" || state === "report"` (`D+16`, `1px solid ${st.color}`, `imRing 2.4s ease-out infinite`).
      - Orb wrapper `<div data-testid={OrbNodeTestId.Orb}>`: `<Orb diameter={diameter} hex={hex} state={state} detail={1} />` + icon overlay `<span data-testid={OrbNodeTestId.Icon}>{icon}</span>` (centered, `zIndex:4`, `pointerEvents:none`, `color:#eef3fb`).
      - Label row: `<span data-testid={OrbNodeTestId.Label}>{label}</span>` (sans 600, `clamp` via `Math.max(12, Math.min(15, diameter*0.19))`) + status row `<span data-testid={OrbNodeTestId.Status}>`: a 6px dot (`st.color`, glow when live) + mono 10.5px `st.color` `{statusLabel}`.
      - `useEffect(() => ensureImmersiveCss(), [])`.
      Guard `noUncheckedIndexedAccess`: `ORB_STATE[state]` is total over the union so safe, but keep the fallback `?? ORB_STATE.idle` for defense.
- [ ] Create `OrbNode.test.tsx`: renders label + status text (via test-id, assert `toHaveTextContent`); the icon slot receives the passed node (`within(getByTestId(Icon))`); halo always present, ping present only for await/incident/report (parametrize — `queryByTestId(Ping)` null for idle/working); `onClick` fires (`userEvent.click` on Root); Root `toHaveRole("button")` and `toHaveAccessibleName(label)`.
- [ ] Create `OrbNode.stories.tsx` — `Overview` (one node per state, each with a DS `<Icon/>` slot and a sample `activeCount`) + `Playground` (`argTypes`: `state`, `diameter`, `hex`, `activeCount` 0–6, `label`, `statusLabel`, and an icon `name` select feeding `<Icon name={…}/>`). Meta `title: "Immersive/OrbNode"`. Import `Icon` from `../../components/Icon/Icon` (direct path, not index).
- [ ] Run checks; fix.
- [ ] Commit:
      ```bash
      rtk git add libs/design-system/src/immersive/OrbNode
      rtk git commit -m "feat(ds): immersive OrbNode — orb + icon + halo/ping/shadow/float chrome"
      ```

---

### Task 9: `CoreOrb` — central orb with wordmark, heartbeat rings & thinking pulse

Port `VcCoreD` (`velin-d-map.jsx`) minus the demo timer: an `Orb` (`detail=4`, `antialias`), a centered "Z·I·B·B·Y" wordmark, an `OrbitField` (fixed core count), a soft glow, and two heartbeat rings whose cadence rises with `intensity` and `thinking`. `thinking` is a controlled prop (no internal `setInterval`).

**Parallel-safe:** no — depends on Task 4 (`Orb`) + Task 5 (`OrbitField`). Parallel-safe **with Task 8** (disjoint folders). Rough size: M.

**Files:**
- Create: `libs/design-system/src/immersive/CoreOrb/CoreOrb.tsx`, `CoreOrb.test.tsx`, `CoreOrb.stories.tsx`

**Interfaces:**
- Produces:
  ```ts
  export enum CoreOrbTestId {
    Root = "core-orb-root", Orb = "core-orb-orb", Wordmark = "core-orb-wordmark", Ring = "core-orb-ring",
  }
  export interface CoreOrbProps {
    size: number; hex?: string; intensity?: number; thinking?: boolean;
    activeCount?: number; onClick?: () => void; ref?: React.Ref<HTMLDivElement>;
  }
  export function CoreOrb(props: CoreOrbProps): JSX.Element;
  ```
- Consumes: `Orb`, `OrbitField`, `ensureImmersiveCss`.

Steps:

- [ ] Create `CoreOrb.tsx` — port `VcCoreD` (translate/strip all Czech comments per Global Constraint 1), replacing the internal `responding` `setInterval`/`setTimeout` with the `thinking` prop. `const lvl = Math.min(1, (intensity ?? 0.4) + (thinking ? 0.5 : 0))`. `const A = hex ?? "#5b8def"`, `S = size`. Structure:
      - Root interactive `<button data-testid={CoreOrbTestId.Root}>` (`aria-label` "ZIBBY — overview" localizable by caller? keep English default `title`/`aria-label="ZIBBY overview"`; the app can wrap — but a11y name required), `onClick`, grid place-items center, `width/height = S`.
      - Two heartbeat rings `[0,1].map(i => <span data-testid={\`${CoreOrbTestId.Ring}-${i}\`} style={{ …, animation: \`imRing ${(3.6 - lvl*1.4).toFixed(1)}s ease-out ${(i*(1.8 - lvl*0.7)).toFixed(1)}s infinite\` }} />)` (`S*0.72`, `1px solid ${A}`).
      - Soft glow `<span>` (`S*1.5`, `radial-gradient(circle, ${A}${thinking ? "3a" : "20"} 0%, transparent 66%)`, `transition: background .8s`).
      - `<OrbitField seed="core" color={A} count={activeCount ?? 4} baseRadius={S*0.42} />`.
      - `<div data-testid={CoreOrbTestId.Orb}><Orb diameter={S*0.66} hex={A} state={thinking ? "thinking" : "idle"} detail={4} antialias /></div>`.
      - Wordmark `<div data-testid={CoreOrbTestId.Wordmark}>` — the "Z·I·B·B·Y" mono text (`fontSize: Math.max(11, S*0.083)`, `#eef3fb`, `textShadow`), interpunct dots `·` between letters, `pointerEvents:none`, `zIndex:3`.
      - `useEffect(() => ensureImmersiveCss(), [])`.
- [ ] Create `CoreOrb.test.tsx`: wordmark renders "Z·I·B·B·Y" (via test-id `toHaveTextContent`); two rings present (`getAllByTestId` prefix → 2); `onClick` fires; Root `toHaveRole("button")` + `toHaveAccessibleName(...)`; `thinking` prop drives the Orb state (assert the `Orb` root exists — can't assert WebGL; instead assert the glow span's style differs, or simply that no crash and wordmark present under both `thinking` values). Keep assertions test-id-scoped.
- [ ] Create `CoreOrb.stories.tsx` — `Overview` (idle vs thinking, a couple of sizes) + `Playground` (`argTypes`: `size` range 96–264, `hex`, `intensity` 0–0.7, `thinking` boolean, `activeCount` 0–6). Meta `title: "Immersive/CoreOrb"`.
- [ ] Run checks; fix.
- [ ] Commit:
      ```bash
      rtk git add libs/design-system/src/immersive/CoreOrb
      rtk git commit -m "feat(ds): immersive CoreOrb — central orb, wordmark, heartbeat rings, thinking pulse"
      ```

---

### Task 10: `OrbMap` — layout + composition

Port `VcMapD`'s composition (minus the demo handoff timer): measure the container (`ResizeObserver`), compute `ellipseLayout`, render `ConnectorLayer` + `CoreOrb` + `OrbNode`s at their positions + any active `HandoffFlare`s. Flares are driven by the `flares` prop (the app supplies real hand-off events).

**Parallel-safe:** no — depends on Tasks 3, 4, 5, 6, 7, 8, 9. Rough size: M/L.

**Files:**
- Create: `libs/design-system/src/immersive/useMeasure.ts`, `useMeasure.test.tsx`, `libs/design-system/src/immersive/OrbMap/OrbMap.tsx`, `OrbMap.test.tsx`, `OrbMap.stories.tsx`

**Interfaces:**
- Produces: `OrbMap`, `OrbMapTestId`, and the `OrbMapNode`/`OrbMapCore`/`OrbMapFlare`/`OrbMapProps` types (see shared contracts). Also `useMeasure()` → `[ref, { w, h }]`.
- Consumes: everything above.

```ts
export enum OrbMapTestId {
  Root = "orb-map-root", Layer = "orb-map-layer", Core = "orb-map-core", Node = "orb-map-node",
}
```

Steps:

- [ ] Create `useMeasure.ts` — port `useMeasure` from `velin-d-map.jsx` (translate its Czech comments to English): `useRef` + `useState({ w: 1200, h: 720 })`, synchronous initial `getBoundingClientRect` read, `ResizeObserver` subscription, cleanup `disconnect()`. Typed `[React.RefObject<HTMLDivElement | null>, { w: number; h: number }]`. Guard `typeof ResizeObserver === "undefined"` (jsdom without polyfill) — skip the observer, keep the default size.
- [ ] Create `useMeasure.test.tsx` — a probe component reads the size; assert it renders with the default `1200×720` under jsdom (no real layout) and does not throw when `ResizeObserver` is absent.
- [ ] Create `OrbMap.tsx`:
      ```tsx
      // header docstring: composition of the immersive orb map. Sizing-API exception
      // documented; all computed geometry is inline-styled (DS is exempt from
      // forbid-dom-props). No per-frame allocation (children own their rAF loops).
      import { useEffect } from "react";
      import { ConnectorLayer, type ConnectorNode } from "../ConnectorLayer/ConnectorLayer";
      import { CoreOrb } from "../CoreOrb/CoreOrb";
      import { HandoffFlare } from "../HandoffFlare/HandoffFlare";
      import { OrbNode } from "../OrbNode/OrbNode";
      import { ellipseLayout, type EllipseInsets } from "../ellipseLayout";
      import { ensureImmersiveCss } from "../immersive.css";
      import { ORB_STATE, type OrbState } from "../orbState";
      import { useMeasure } from "../useMeasure";

      export enum OrbMapTestId {
        Root = "orb-map-root",
        Layer = "orb-map-layer",
        Core = "orb-map-core",
        Node = "orb-map-node",
      }
      // OrbMapNode / OrbMapCore / OrbMapFlare / OrbMapProps — as in the shared contracts block.

      const DEFAULT_INSETS: EllipseInsets = { left: 0, right: 0, bottom: 0 };

      export function OrbMap({ nodes, core, insets, flares = [], onSelectNode, onSelectCore, ref }: OrbMapProps) {
        useEffect(() => ensureImmersiveCss(), []);
        const [measureRef, { w, h }] = useMeasure();
        const merged: EllipseInsets = { ...DEFAULT_INSETS, ...insets };
        const layout = ellipseLayout(w, h, nodes.length, merged);

        // position lookup for flares by node id
        const posById = new Map<string, { x: number; y: number }>();
        nodes.forEach((n, i) => {
          const p = layout.positions[i];
          if (p) posById.set(n.id, p);
        });

        const connectorNodes: ConnectorNode[] = nodes.map((n, i) => {
          const p = layout.positions[i] ?? { x: layout.cx, y: layout.cy };
          return { id: n.id, x: p.x, y: p.y, color: ORB_STATE[n.state].color, live: ORB_STATE[n.state].live };
        });

        return (
          <div ref={ref} data-testid={OrbMapTestId.Root} style={{ position: "absolute", inset: 0 }}>
            <div ref={measureRef} data-testid={OrbMapTestId.Layer} style={{ position: "absolute", inset: 0 }}>
              <ConnectorLayer center={{ x: layout.cx, y: layout.cy }} nodes={connectorNodes} />
              <div style={{ position: "absolute", left: layout.cx, top: layout.cy, transform: "translate(-50%,-50%)", zIndex: 2 }}>
                <div data-testid={OrbMapTestId.Core}>
                  <CoreOrb size={layout.coreSize} hex={core.hex} intensity={core.intensity} thinking={core.thinking} activeCount={core.activeCount} onClick={onSelectCore} />
                </div>
              </div>
              {nodes.map((n, i) => {
                const p = layout.positions[i] ?? { x: layout.cx, y: layout.cy };
                return (
                  <div key={n.id} data-testid={`${OrbMapTestId.Node}-${n.id}`} style={{ position: "absolute", left: p.x, top: p.y, transform: "translate(-50%,-50%)", zIndex: 2 }}>
                    <OrbNode diameter={layout.nodeD} hex={n.hex} state={n.state} label={n.label} statusLabel={n.statusLabel} icon={n.icon} activeCount={n.activeCount} nodeId={n.id} onClick={() => onSelectNode?.(n.id)} />
                  </div>
                );
              })}
              {flares.map((f) => {
                const from = posById.get(f.fromId);
                const to = posById.get(f.toId);
                if (!from || !to) return null;
                return <HandoffFlare key={f.id} from={from} to={to} color={f.color} />;
              })}
            </div>
          </div>
        );
      }
      ```
      (Move the `OrbMapNode`/`OrbMapCore`/`OrbMapFlare`/`OrbMapProps` interface declarations from the shared-contracts block into this file above the component. Note the `OrbNode` position wrapper here supplies `left/top/translate` — so `OrbNode`'s own root must NOT also absolutely position itself; keep `OrbNode` as a relative flex column (as in the prototype, where `VcNodeD` sets `left/top` itself — here we hoist positioning to the map wrapper, so drop the absolute `left/top` from `OrbNode`'s root and keep only its flex layout). Ensure Task 8's `OrbNode` root is relative, not absolutely positioned.)
- [ ] Create `OrbMap.test.tsx`: given 8 nodes + a core, renders 8 `Node-<id>` wrappers + the `Core`; `onSelectNode` fires with the node id on click; `onSelectCore` fires on core click; a `flares` entry with valid `fromId`/`toId` renders a `HandoffFlare` (assert its root present), an entry with an unknown id renders nothing. Provide a `ResizeObserver` stub at top of the test if the jsdom env lacks one (`globalThis.ResizeObserver ??= class { observe(){} unobserve(){} disconnect(){} }`).
- [ ] Create `OrbMap.stories.tsx` — `Overview` (the full 8-node map with a representative mix of states/counts, in a large `relative` framed box with the radial-gradient background) + `Playground` (a stateful `render:` with `useState` for the 8 nodes' states/counts, a core `thinking` toggle, and a **"Trigger flare" button** that pushes a `HandoffFlare` between two chosen nodes with a fresh id and auto-clears via `onDone`). `argTypes` for the editable knobs. Import `Icon` directly. Meta `title: "Immersive/OrbMap"`.
- [ ] Run checks; fix.
- [ ] Commit:
      ```bash
      rtk git add libs/design-system/src/immersive/useMeasure.ts libs/design-system/src/immersive/useMeasure.test.tsx libs/design-system/src/immersive/OrbMap
      rtk git commit -m "feat(ds): immersive OrbMap — ellipse layout + composition + flares"
      ```

---

### Task 11: Assemble the `immersive` barrel + export from the DS public index

The single task that touches `libs/design-system/src/immersive/index.ts` and `libs/design-system/src/index.ts`, so Tasks 4–10 never collide on a shared export file.

**Parallel-safe:** no (the one integration point for all immersive exports; depends on Tasks 3–10). Rough size: S.

**Files:**
- Create: `libs/design-system/src/immersive/index.ts`
- Modify: `libs/design-system/src/index.ts`

**Interfaces:**
- Produces: the public surface — `Orb`/`OrbProps`/`OrbTestId`, `OrbitField`/…, `OrbNode`/…, `CoreOrb`/…, `ConnectorLayer`/…, `HandoffFlare`/…, `OrbMap`/`OrbMapTestId`/`OrbMapNode`/`OrbMapCore`/`OrbMapFlare`/`OrbMapProps`, `ellipseLayout`/its types, `OrbState`/`ORB_MOTION`/`ORB_STATE`/`ORB_STATE_COLOR`, `seededRandom`, `arcPath`, `canMountWebGL`.
- Consumes: all component modules.

Steps:

- [ ] Create `immersive/index.ts` re-exporting every public value + type from the bundle (values via `export {…}`, types via `export type {…}`; each component's `*TestId` enum is a value export). Include the pure fns/types (`ellipseLayout`, `EllipseLayout`, `EllipseInsets`, `OrbPosition`, `OrbState`, `ORB_MOTION`, `ORB_STATE`, `ORB_STATE_COLOR`, `seededRandom`, `arcPath`, `canMountWebGL`).
- [ ] Append to `libs/design-system/src/index.ts`: `export * from "./immersive";` (or an explicit block matching the file's existing style — check how the file re-exports and mirror it; explicit is safer for tree-shaking, but `export *` from the curated barrel is acceptable since the barrel is hand-authored). Keep exports alph/section-ordered per the file's `sort-imports`/existing convention.
- [ ] Run checks: `rtk pnpm check:lint && rtk pnpm check:types && rtk pnpm test`. (Typecheck now validates the whole public surface; Storybook glob already covers the files.)
- [ ] Commit:
      ```bash
      rtk git add libs/design-system/src/immersive/index.ts libs/design-system/src/index.ts
      rtk git commit -m "feat(ds): export the immersive orb-map bundle from the design system"
      ```

---

### Task 12: App adapter `SubsystemOrbMap` (domain → OrbMap)

The thin domain composite in `apps/web/features/chat/`: map `SubsystemWithStatus[]` + runs + pipelines onto generic `OrbMap` props. Implements the `ChatScreen` seam contract (`onOpenCore` / `onSelectSubsystem`). No inline styles (app is under `forbid-dom-props`) — it only composes DS.

**Parallel-safe:** no — depends on Task 1 (English enum), Task 2 (moved `activeRunsBySubsystem`), Task 11 (DS exports). Rough size: M.

**Files:**
- Create: `apps/web/features/chat/components/SubsystemOrbMap.tsx`, `apps/web/features/chat/components/SubsystemOrbMap.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface SubsystemOrbMapProps {
    subsystems: SubsystemWithStatus[];
    runs: readonly RunView[];
    pipelines: readonly Pipeline[];
    selectedSubsystemId: SubsystemId | null;
    thinking: boolean;                       // chat streaming flag → core pulse
    flares?: OrbMapFlare[];                   // optional real hand-off events
    onOpenCore: () => void;
    onSelectSubsystem: (id: SubsystemId) => void;
  }
  export function SubsystemOrbMap(props: SubsystemOrbMapProps): JSX.Element;
  export enum SubsystemOrbMapTestId { Root = "subsystem-orb-map-root" }
  ```
- Consumes: `OrbMap`, `OrbMapNode`, `OrbMapFlare`, `ORB_STATE`(not needed), `Icon` from `@zibby/design-system`; `activeRunsBySubsystem` from `../subsystemLoad`; `SubsystemWithStatus`, `SubsystemId`, `SubsystemState` from `@zibby/contracts`; `RunView` from `../../runs/run`, `Pipeline` from `../../domain`.

Steps:

- [ ] Create `SubsystemOrbMap.tsx`:
      - `const STATE_MAP: Record<SubsystemState, OrbState> = { idle: "idle", running: "working", report: "report", waiting: "await" };`
      - `const ICON_MAP: Record<SubsystemId, IconName> = { forge: "code", herald: "link", sentinel: "shield", scout: "compass", maestro: "checkpoint", beacon: "warn", puls: "pulse", loom: "search" };` (all verified present in the DS icon set).
      - Compute `const counts = activeRunsBySubsystem(runs, pipelines);` and build `nodes: OrbMapNode[]` in the fixed `SUBSYSTEMS` order (import `SUBSYSTEMS` from `@zibby/contracts` to guarantee the 8-node ring order matches the prototype; map each subsystem's live status from the `subsystems` prop by id, falling back to `idle`/0). For each: `{ id, hex: sub.color, state: STATE_MAP[status.state], label: sub.name, statusLabel: t(statusKey), icon: <Icon name={ICON_MAP[id]} size="lg" />, activeCount: counts[id] ?? 0 }`.
      - Localize `statusLabel` via `useTranslations()` — reuse existing status label keys if present (StatusPill already localizes working/report/waiting); otherwise add keys to `cs.json`/`en.json` (see step below). Do NOT hardcode Czech.
      - `core`: `{ hex: <accent hex>, activeCount: 4, intensity: Math.min(0.7, 0.28 + runningCount*0.08), thinking }` where `runningCount` = number of active runs (sum of `counts` values, or the running-run count consistent with the prototype's `intensity`). Use the DS accent hex via `resolveStateToneHex("accent")` (imported) so no literal.
      - Wrap in `<div data-testid={SubsystemOrbMapTestId.Root}>` and render `<OrbMap nodes={nodes} core={core} insets={...} flares={flares} onSelectNode={(id) => onSelectSubsystem(id as SubsystemId)} onSelectCore={onOpenCore} />`. `insets` come from the seam (Task 13 measures the tasks-panel width + chat dock height; for now accept an optional `insets` prop or compute a sensible default — pass through from ChatScreen in Task 13). Selection highlight: pass `selectedSubsystemId` down only if OrbMap needs it; phase-1 selection is handled by ChatScreen opening the drawer, so `selectedSubsystemId` may be unused here (keep the prop for parity, mark intentionally: the drawer/dialog own selection visuals). If unused, prefix or document to satisfy lint.
      - No inline `style` anywhere (app file). All geometry lives inside DS `OrbMap`.
- [ ] Add i18n keys if the status labels aren't already keyed: add to `apps/web/i18n/messages/cs.json` (Czech values: idle "v klidu", working "pracuje", report "hlášení čeká", waiting "čeká na rozhodnutí") and `en.json` (English) under a `chat.subsystemStatus.*` namespace, and read via `t()`. Reuse existing keys if StatusPill/SubsystemDrawer already define equivalents (grep first — prefer reuse over duplication).
- [ ] Create `SubsystemOrbMap.test.tsx` (uses `apps/web/test/renderWithIntl.tsx` wrapper): given a roster + runs/pipelines, asserts the map root renders and 8 nodes appear (`getAllByTestId` on the `OrbMapTestId.Node-` prefix, imported from DS); `onSelectSubsystem` fires with the right id on a node click; `onOpenCore` fires on core click; a `running` subsystem maps to the `working` orb state (assert via the node's status label text or a state-derived attribute you can observe — since Orb is a no-op in jsdom, assert the localized status label text). Provide the `ResizeObserver` stub. Mock nothing WebGL (canMountWebGL false in jsdom).
- [ ] Run checks: `rtk pnpm check:lint && rtk pnpm check:types && rtk pnpm test`.
- [ ] Commit:
      ```bash
      rtk git add apps/web/features/chat/components/SubsystemOrbMap.tsx apps/web/features/chat/components/SubsystemOrbMap.test.tsx apps/web/i18n/messages/cs.json apps/web/i18n/messages/en.json
      rtk git commit -m "feat(chat): SubsystemOrbMap adapter mapping domain onto the immersive OrbMap"
      ```

---

### Task 13: Swap the ChatScreen seam

Replace `<CosmicScene .../>` with `<SubsystemOrbMap .../>`; drop the dead scene-fed locals (`dock`/`buildDock`, `agents`/`buildConstellation`, `completedTick`, `streamChars`); relocate the `SceneMode` type + `MODE_DOT` map (still driving the header status dot) out of the doomed `scene/` folder into a small local module. Measure the tasks-panel width + chat-dock height for `insets`.

**Parallel-safe:** no — depends on Task 12. Rough size: M.

**Files:**
- Create: `apps/web/features/chat/chatMode.ts` (relocated `SceneMode` type + `MODE_DOT` map + the derivation helper, English identifiers — rename type to `ChatActivity` or keep `SceneMode`? Rename to `ChatMode` to drop the "scene" coupling)
- Modify: `apps/web/features/chat/components/ChatScreen.tsx`

**Interfaces:**
- Produces: `chatMode.ts` → `export type ChatMode = "idle" | "listening" | "thinking" | "streaming" | "speaking" | "tool" | "waiting-approval" | "error";` and `export const MODE_DOT: Record<ChatMode, { tone: DotTone; pulse: boolean }>;`.
- Consumes: `SubsystemOrbMap` (Task 12), `DotTone` from `@zibby/design-system`.

Steps:

- [ ] Create `apps/web/features/chat/chatMode.ts`: move the `SceneMode` union (from `scene/sceneTypes.ts`) renamed to `ChatMode`, plus the `MODE_DOT: Record<ChatMode, { tone: DotTone; pulse: boolean }>` map (currently defined near line 71 of ChatScreen — move its literal here verbatim, re-typed to `ChatMode`). Keep the docstring, English-only.
- [ ] Edit `ChatScreen.tsx`:
      - Remove imports: `buildConstellation` (`../scene/constellation`), `buildDock` (`../scene/dock`), `CosmicScene` (`../scene/CosmicScene`), `type SceneMode` (`../scene/sceneTypes`). Add `import { SubsystemOrbMap } from "./SubsystemOrbMap";` and `import { type ChatMode, MODE_DOT } from "../chatMode";` (remove the in-file `MODE_DOT` const).
      - Remove the `agents` `useMemo(buildConstellation…)`, the `dock` `useMemo(buildDock…)`, and the `const [completedTick, setCompletedTick] = useState(0)` + any `setCompletedTick` call sites (grep — the completed-turn hook may call it; if `completedTick` was only fed to the scene, delete the state and the setter call; if the setter is invoked from a completion callback that also does other work, just drop the `setCompletedTick` line). Keep `agentCatalog`/`pipelineCatalog`/`chainCatalog`/`pins` queries only if still used elsewhere — `pipelineCatalog` is still passed to the new map (`pipelines`), so keep it; drop `agentCatalog`/`chainCatalog`/`pins` if now unused (grep to confirm before deleting).
      - Retype `const mode: SceneMode = …` → `const mode: ChatMode = …` (derivation body unchanged — it still feeds the header `<StatusDot pulse={MODE_DOT[mode].pulse} tone={MODE_DOT[mode].tone} />`).
      - Replace the `<CosmicScene .../>` JSX block with:
        ```tsx
        <SubsystemOrbMap
          onOpenCore={() => setCoreOpen(true)}
          onSelectSubsystem={setSelectedSubsystemId}
          pipelines={pipelineCatalog ?? []}
          runs={runs}
          selectedSubsystemId={selectedSubsystemId}
          subsystems={subsystems ?? []}
          thinking={stream.streaming || sendMessage.isPending}
        />
        ```
        (Order props to satisfy `react/jsx-sort-props`: shorthand first, then alpha. The `insets` — tasks-panel width + dock height — can be added as a follow-up prop; for phase-1 parity pass a static `insets` matching the current layout, e.g. `{ left: 300, bottom: 230 }` measured against the existing `w-[300px]` tasks panel and the composer band, OR compute via a measured ref. Keep it simple: pass `insets={{ left: 300, right: 0, bottom: 230 }}` and note the measured-inset refinement is optional polish. If `SubsystemOrbMap` derives insets itself, omit the prop.)
      - Remove now-dead `streamChars`/`dock`/`mode`(as scene prop)/`completedTick` references entirely.
- [ ] Run checks: `rtk pnpm check:lint && rtk pnpm check:types && rtk pnpm test`. (ChatScreen.test.tsx still imports `CosmicSceneTestId`/`SubsystemOrbsOverlayTestId` and asserts `data-mode` — those tests are fixed in Task 14, so **this task's `pnpm test` will show ChatScreen.test.tsx failures**. That is expected and acceptable *within* this task only if the plan runs 13+14 back-to-back; to keep the per-task-green invariant, fold the ChatScreen.test.tsx rewrite into THIS task instead of Task 14.) → **Decision: move the ChatScreen.test.tsx rewrite into Task 13** (see next step) so checks are green at the commit boundary.
- [ ] Rewrite `apps/web/features/chat/components/ChatScreen.test.tsx`: replace the `CosmicSceneTestId`/`SubsystemOrbsOverlayTestId` imports with `SubsystemOrbMapTestId` (from `./SubsystemOrbMap`) and `OrbMapTestId` (from `@zibby/design-system`). The `describe("orb mode derivation")` block asserted `data-mode` on the scene root; re-target those assertions onto the **header status dot** — assert `MODE_DOT[mode]` behavior via the header `StatusDot` (select it by `ChatScreenTestId` if it has one, or add a testid to that dot) OR assert the derived tone directly by extracting the derivation into a tested helper. Simplest faithful path: keep the mode-derivation assertions but observe them through the header dot's tone/pulse (give the header `StatusDot` a `data-testid` and assert `toHaveClass`/tone via the DS `StatusDotTestId`). Any assertion that the scene received a subsystem roster becomes an assertion that `SubsystemOrbMap` rendered (its root + node count). Preserve every OTHER assertion in the file (voice-mode, palette, etc.) unchanged.
- [ ] Re-run checks until green.
- [ ] Commit:
      ```bash
      rtk git add apps/web/features/chat/chatMode.ts apps/web/features/chat/components/ChatScreen.tsx apps/web/features/chat/components/ChatScreen.test.tsx
      rtk git commit -m "feat(chat): swap CosmicScene for SubsystemOrbMap at the ChatScreen seam"
      ```

---

### Task 14: Delete `scene/` and fix the remaining importers

Remove the entire old scene directory (already stripped of `subsystemLoad` in Task 2 and unreferenced by ChatScreen after Task 13) and repair the last importer (`CoreOverviewDialog.stories.tsx`).

**Parallel-safe:** no — depends on Task 13. Rough size: S/M (bulk delete + one story fix).

**Files:**
- Delete: all of `apps/web/features/chat/scene/` (the remaining ~26 files — controllers, layers, `CosmicScene.*`, `SubsystemOrbsOverlay.*`, `sceneTypes.ts`, `constellation.ts`, `dock.ts`, `modeVisuals.*`, `canMountWebGL.ts`, `CosmicScene.stories.tsx`, etc.)
- Modify: `apps/web/features/chat/components/CoreOverviewDialog.stories.tsx` (drop any `scene/` import / reference in its comment or decorator)

**Interfaces:** none produced. Removes the `scene/` module surface entirely.

Steps:

- [ ] Confirm no live (non-test) importers remain: `rtk grep -rn "features/chat/scene\|from \"../scene\|from \"./scene" apps/web` — the only hits should be inside `scene/` itself (self-references) and `CoreOverviewDialog.stories.tsx`.
- [ ] Fix `CoreOverviewDialog.stories.tsx`: its line-5 comment references `CosmicScene.stories.tsx`; remove/reword the reference and delete any actual import from `../scene`. (Its real imports were `@zibby/contracts` + query keys — confirm it has NO runtime `scene/` import; if it only mentions the scene in prose, just update the comment.)
- [ ] Delete the directory: `rtk git rm -r apps/web/features/chat/scene`.
- [ ] Grep the whole app for stragglers: `rtk grep -rn "CosmicScene\|SubsystemOrbsOverlay\|sceneController\|sceneTypes\|buildConstellation\|buildDock\|modeVisuals" apps/web` → nothing.
- [ ] Run checks: `rtk pnpm check:lint && rtk pnpm check:types && rtk pnpm test`. Fix any dangling references (e.g. a test util or barrel that re-exported a scene symbol).
- [ ] Commit:
      ```bash
      rtk git add -u apps/web/features/chat/scene apps/web/features/chat/components/CoreOverviewDialog.stories.tsx
      rtk git commit -m "chore(chat): delete the old cosmic scene directory after the orb-map swap"
      ```

---

### Task 15: Final integration — full checks + live verification

Whole-suite green + a real-browser parity pass against the prototype.

**Parallel-safe:** no — depends on all prior tasks. Rough size: S (verification, no new code unless a defect surfaces).

**Files:** none (unless a fix is required — then the fix lands here with its own commit).

Steps:

- [ ] Full clean check sweep, in order, all green:
      - `rtk pnpm check:lint`
      - `rtk pnpm check:types`
      - `rtk pnpm test`
- [ ] Storybook smoke: `rtk pnpm storybook` and confirm every `Immersive/*` story renders live WebGL orbs (Orb, OrbNode, CoreOrb) and the `OrbMap` Playground's "Trigger flare" button launches a comet. Toggle the `detail`/`state`/`diameter`/motion-override knobs and confirm they drive the orb; toggle `prefers-reduced-motion` (OS setting or devtools emulation) and confirm rotation/noise/CSS animations freeze.
- [ ] Live app verify on :3000: `rtk pnpm web:dev`, open the chat screen. Open the prototype `design/Z.I.B.B.Y/ZIBBY Velin-D.html` side-by-side and check parity: 8 orbs on the responsive ellipse, center core with wordmark + heartbeat, connectors with live dash-pulse, halos/pings per state, orbit task-dots scaling with active runs, clean radial-gradient background (no nebula/starfield). Click a node → the existing `SubsystemDrawer` opens; click the core → `CoreOverviewDialog` opens; send a chat message → the core switches to the thinking pulse while streaming. Verify 9 WebGL contexts don't error the console and that navigating away disposes them (no context-lost warnings piling up).
- [ ] Resize the window narrow/short → confirm the ellipse + core shrink (no overlap with the chat dock or tasks panel), matching `ellipseLayout`'s clamps.
- [ ] If any defect is found, fix it, re-run the full check sweep, and commit with a focused message (`fix(...)`). Otherwise no commit — report parity confirmed.
- [ ] Report done: the branch `feat/velin-d-orb-dashboard` now carries the immersive orb map; the old scene is gone; suite + types + lint green; live parity confirmed. (Do not merge — the PR gate is the operator's.)
