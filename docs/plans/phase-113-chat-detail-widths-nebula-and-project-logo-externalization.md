# Phase 113 — Chat detail widths, nebula framing & project-logo externalization

> Closes the current `TODO.md`. Five items across two concerns: **Chat UI polish**
> (task-detail width, subsystem-drawer close + width, nebula framing) and **image
> storage unification** (project logo externalized to match the Phase-73 pattern
> already used by agents & pipelines).

## Context & decisions

- **Image storage (items 4 + 5) — decided:** reuse the existing **Phase-73
  `AvatarAssetStore` pattern**. Project logo bytes move out of `_projects.json` into
  `.zibby/data/projects/assets/<id>.<ext>`; the JSON holds only a bare `assets/<id>.<ext>`
  ref; the **wire contract stays a `data:image/*` URI** (re-inlined on read). Agents and
  pipelines already work this way — this retrofits projects to match, unifying all three.
  We do **not** move uploaded bytes into `apps/web/public` (that dir holds only the 5
  bundled static avatars); user data stays in the portable vault.
- Reference implementation to copy: `apps/api/src/agents/agents.storage.service.ts` and
  `apps/api/src/pipelines/pipelines.storage.service.ts` + `apps/api/src/shared/file-storage/avatar-asset-store.ts`.
- Chat detail-width target is the `/runs` layout: `RunDetail` fills `minmax(0,1fr)` inside a
  1400px-capped centered grid — no fixed pixel width. The chat column is currently pinned to
  `w-[420px]`.

## Delivery — 4 commits

Each commit must pass `pnpm check:lint && pnpm check:types && pnpm test` before it lands,
then `graphify update .`. Mark items in `TODO.md` done as each commit lands.

---

### Commit 1 — Chat task detail width (TODO item 1)

**Goal:** widen the chat inline task detail so it reads as wide as the `/runs` detail
instead of a cramped fixed column.

**File:** `apps/web/features/chat/components/ChatTaskDetailColumn.tsx` (~L64-68).

Current outer wrapper:
```tsx
className="pointer-events-none absolute inset-y-0 left-[316px] z-20 hidden w-[420px] flex-col p-4 lg:flex"
```

- Replace the fixed `w-[420px]` with a fluid, generous width that mirrors the `/runs`
  detail feel. Because this column is an absolutely-positioned overlay pinned at
  `left-[316px]`, it cannot use the `/runs` grid directly — instead cap it with a
  right-anchored fluid width: e.g. `right-4 w-auto` (span from `left-[316px]` to a right
  inset) **or** a large `max-w-[1060px]` with `w-[calc(...)]`. Prefer the `right-*`
  approach so it fluidly fills the available chat width minus the left gutter, matching the
  `minmax(0,1fr)` behaviour on `/runs`.
- Keep `pointer-events-none` on the wrapper and `pointer-events-auto` on the inner panel
  (unchanged), keep the `Panel` `maxHeight: 100%` / `overflowY: auto` passthrough.
- Do not change `RunDetail` itself — it stretches to its container.

**Verify:** the panel visibly spans most of the chat area (leaving the left task rail
visible), content reflows, no horizontal page scroll. Update/keep the existing
`ChatTaskDetailColumn` test (testid-based); adjust any width assertion if one exists.

---

### Commit 2 — Subsystem drawer: fix close (X) + widen (TODO item 2)

**File:** `apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx`.

**2a — Close button not working.** The hero gradient overlay at ~L230:
```tsx
<div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/55 to-transparent" />
```
is `absolute inset-0` (covers the top-right where the X sits) with **no `pointer-events-none`**,
so it eats the click before it reaches the X button (~L232-240, `onClick={onClose}`).
- Add `pointer-events-none` to that gradient overlay div (it is decorative — should never
  intercept clicks).
- Confirm the X button (`SubsystemDrawerTestId.Close`) then fires `onClose` →
  `setSelectedSubsystemId(null)` (wired in `ChatScreen.tsx` ~L543-548). The Escape handler
  (~L165-171) already works; keep it.
- If any other decorative absolute overlay inside the drawer lacks `pointer-events-none`
  and overlaps interactive controls, fix those too.

**2b — Width.** Root wrapper ~L192-193 is `lg:w-[520px]`. Widen to match the new task-detail
width from Commit 1 (same value / same approach) so the two detail surfaces are visually
consistent. Keep the `w-full` mobile behaviour below `lg`.

**Verify:** clicking the X closes the drawer (add/adjust a test that clicks
`SubsystemDrawerTestId.Close` and asserts `onClose` called); Escape still closes; drawer is
visibly wider and matches the task detail.

---

### Commit 3 — Nebula framing around orb + subagents (TODO item 3)

**Files:** `apps/web/features/chat/scene/backgroundLayer.ts` and `sceneController.ts`.

**Problem:** the nebula/stars are painted **uniformly** across the full-screen background
canvas (a separate opaque WebGL canvas *under* the transparent orb canvas). The only
orb-aware term is a single faint additive glow (`* 0.28`) centered on `uGlowCenter`
(`backgroundLayer.ts` ~L112-116), fed by `setGlowCenter(0, glowCenterFromClusterY(CLUSTER_Y))`
(`sceneController.ts` ~L282). Net effect: orbs look weak, floating on a flat sky rather than
framed by the nebula.

**Goal:** concentrate/intensify the nebula so it visibly wraps the orb + subagent cluster in
the top third, making the orbs read as embedded in the nebula.

Approach (shader-side, cheapest & self-contained — stay on the background canvas):
- In the fragment shader, weight the **nebula cloud** term (~L98-104) by proximity to
  `uGlowCenter` so cloud density/brightness peaks around the cluster and falls off toward the
  edges (a radial falloff using `length(p - uGlowCenter)`), instead of uniform coverage.
- Strengthen the orb glow term (~L112-116): raise intensity above `0.28` and/or widen the
  `smoothstep` radius so there's a real luminous halo behind the cluster.
- Optionally add a subtle secondary falloff so the star layers thin slightly away from the
  cluster, keeping focus on the top third.
- Keep `setGlowCenter` fed from `CLUSTER_Y` (`sceneController.ts` ~L282); if the cluster moves,
  the nebula focus follows.

**Constraints:** no new canvas/layer unless the shader approach proves insufficient; keep it
GPU-cheap (mobile path exists). This is a visual-tuning change — no contract/test impact
expected, but keep the scene Storybook (`phase-37-chat-scene-storybook`) rendering.

**Verify:** manual visual check — orbs sit inside a brighter nebula pocket, edges darker;
mobile still renders. (WebGL screenshots are flaky under swiftshader — verify the scene renders
without error and describe the intended look; do not gate on a pixel screenshot.)

---

### Commit 4 — Project logo externalization + unification (TODO items 4 + 5)

**Goal:** stop writing base64 into `_projects.json`; externalize the logo to
`.zibby/data/projects/assets/<id>.<ext>` using the same `AvatarAssetStore` the agents &
pipelines storage services use. Wire contract unchanged (data URI).

**Reference (copy the pattern):**
- `apps/api/src/shared/file-storage/avatar-asset-store.ts` (`AvatarAssetStore`:
  `externalize`, `inlineSync`, `remove`, `isAssetRef`, exported from `.../file-storage/index.ts`).
- `apps/api/src/agents/agents.storage.service.ts` — `toDiskEntity` write helper, `fromFrontmatter`
  read inline, `delete` override, `onModuleInit` → `sweepInlineAvatars`.
- `apps/api/src/pipelines/pipelines.storage.service.ts` — identical.

**Contract:** `libs/contracts/src/projects/project.schema.ts` (~L170).
- Current: `logo: z.string().startsWith("data:image/").max(AVATAR_MAX).optional()`.
- Change to `logo: AvatarSchema.optional()` (from `common.schema.ts`) so it also accepts a
  `/`-rooted path (parity with agent/pipeline `avatar`). Add a nullable clear signal to
  `UpdateProjectSchema` (~L214): `logo: AvatarSchema.nullable().optional()` so a logo can be
  cleared explicitly (agents/pipelines have this; projects don't). Wire values remain data
  URIs or `/`-paths — never a bare `assets/` ref (that's on-disk only).

**Storage:** `apps/api/src/projects/projects.storage.service.ts`. NOTE: this service is a
**standalone `_projects.json` manifest store** — it does NOT extend `MarkdownEntityStore`, so
there are no `fromFrontmatter`/`writeEntity` seams. Weave the externalize/inline into the
manifest map operations instead:
- Construct `private readonly logoAssets = new AvatarAssetStore(<PROJECTS_DIR>)` → assets at
  `.zibby/data/projects/assets/`.
- **Write** (`create` ~L71-79, `update` ~L81-102, and `writeAtomic` ~L113-123): before writing,
  for each project if `logo` is a data URI → `externalize(id, logo)` and persist the returned
  `assets/<id>.<ext>` ref; if `logo` is a `/`-path or absent → persist as-is; if a logo is being
  removed/replaced → `remove(id)` the stale asset. Keep the existing `hasSecrets` strip.
- **Read** (`list` ~L38-52, where each entry is `ProjectSchema.safeParse`'d): if the stored
  `logo` `isAssetRef` → `inlineSync` back to a data URI (omit `logo` if the file is gone);
  `/`-paths and already-inline pass through.
- **Delete** (~L104-110): after removing the project, `logoAssets.remove(id)`.
- **Migration:** add `onModuleInit` → a one-shot sweep that reads raw `_projects.json`, and for
  any entry whose `logo` starts with `data:` rewrites the manifest with the externalized ref.
  Idempotent, tolerant (the 2 existing inline blobs must migrate cleanly on first boot).

**Web:** no change required — `ProjectBasicsPanel` uploads a data URI and `ProjectCard` /
`IconTile` render `project.logo` as a data URI; the wire still delivers a data URI. Verify
after implementation that upload → save → reload still shows the logo.

**Tests:**
- API: add a projects.storage test mirroring the agents/pipelines asset tests — create with a
  data-URI logo asserts `_projects.json` holds `assets/<id>.<ext>` (no `data:`) and a file
  exists under `assets/`; `list` re-inlines to a data URI; `update` replacing the logo removes
  the stale asset; `delete` removes the asset; the `onModuleInit` sweep migrates a seeded inline
  blob.
- Keep existing project tests green.

**Verify:** boot the API once against a `_projects.json` containing an inline base64 logo →
after boot the JSON has `assets/...` refs and the bytes live in `assets/`; the API response
still returns a data URI.

---

## Definition of done

- [ ] `TODO.md` fully checked off (all 5 items).
- [ ] 4 commits, each green on `pnpm check:lint && pnpm check:types && pnpm test`.
- [ ] `_projects.json` contains no `data:image` base64; logos live under
      `.zibby/data/projects/assets/`; existing 2 logos migrated on boot.
- [ ] Chat task detail and subsystem drawer are visibly wide and consistent; the X closes the
      drawer; the nebula frames the orb cluster.
- [ ] `graphify update .` run after the code lands; self-knowledge note refreshed if the
      pre-commit gate requires it.
