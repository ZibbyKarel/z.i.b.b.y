# HUD → Chat UI migration — handoff / recovery

If this session dies, resume from here.

## Where things stand

Branch `feat/hud-to-chat-migration`, off `main` @ 32ce9b9e. **PARKED at the PR gate —
nothing pushed, no PR** (Tier-3: the operator reviews and merges). Do NOT work on `main`.

Read in this order: `ROADMAP.md` (phases + loop) → `DECISIONS.md` (O1–O4 operator calls,
D1–D13 architecture) → `PROGRESS.md` (live truth, per-route ledger).

**F0–F6 are committed and every catalog/entity route is on the immersive shell.** F6b (the
D13 `EntityHero` dedup) and F7 (memory + gates) were dispatched in parallel and were in
flight when this was last written — check `rtk git log --oneline` against PROGRESS's commit
column to see whether they landed. What remains after them: F8 (overview dissolution per O3,
delete `/overview` and the `/runs` list), F9 (chat reachability sweep), F10 (delete the old
shell). **The reusable migration recipe is the 9 numbered steps in
`docs/plans/hud2chat-F3-catalogs-a.md`** — every later plan references it rather than
restating it. Do not re-derive it.

## What this arc is

Make the operator able to run everything from Chat UI without leaving the new design.
Hybrid model (O1): glanceable things dissolve into Chat; heavy CRUD/config pages are
rewritten into a new immersive full-page shell that Chat links to. The old HUD shell is
deleted at the end (O2, phase F10). Breaking the old HUD visually along the way is
explicitly accepted by the operator.

## The per-phase loop

1. Opus writes `docs/plans/hud2chat-F<N>-*.md`.
2. Dispatch a Sonnet `general-purpose` subagent with the plan as its brief.
   **Subagents do not commit.**
3. Opus reviews the diff vs. the plan + `.claude/skills/design-system/SKILL.md`.
4. `pnpm check:lint` → `tsc -p apps/web` → scoped vitest.
5. Commit per phase, then update `ROADMAP.md` + `PROGRESS.md` + this file immediately.

## Key facts worth not re-deriving

- The design corpus has exactly **one** genuine full-page surface: `ZIBBY Archiv úloh.html`.
  Everything else in Velín-D is a modal overlay above the orb map. So the sub-page chrome
  contract is: back-arrow header + title/subtitle, no orb map, no dock/rail/bottombar.
- `AppShell` forks on `isFullscreenRoute(pathname)` against the `FULLSCREEN_ROUTES` table in
  `apps/web/state/config.ts` (D2, added in F0). It prefix-matches, so registering `/skills`
  also covers `/skills/[id]`. F10 collapses this table away.
- `HudPanel` is an **app composite** at `apps/web/components/HudPanel/HudPanel.tsx`, NOT a DS
  component — the DS SKILL.md line listing it is stale (D10). Its `surface="glass"` prop (D7)
  is what every migrated page opts into; `tone`/`live` are hud-only.
- Full-bleed bands need `GlassSurface radius="none"`, not `"panel"` (D11) — and jsdom cannot
  see it, so that class of defect is only ever caught in a real browser.
- Migrated pages must re-supply their own content padding: `MainLayout`'s `<main>` used to
  give `padding={["300","350"]}`; `ImmersiveShell`'s body has none by design (D12).
- `GlassSurface` exists (`libs/design-system/src/immersive/`); `ImmersiveShell` (DS) +
  `ImmersivePage` (app wrapper supplying the `next/link` back button) are the F0 additions.
- `ZT.*` in the design files is design vocabulary, **not** runtime tokens.
- `chains` and `pipelines` use ONE Screen for both list and detail (`selectedId` prop) —
  unlike every other section's Screen + DetailScreen pair.
- Biggest screens: `projects/ProfileScreen.tsx` 685 LOC, `pipelines/Screen.tsx` 431 LOC.

## Gotchas (carried forward from earlier arcs)

- `tsc -p apps/web` **directly** — `rtk pnpm typecheck` lies (base config misses apps/web).
- `rtk git commit` can print "ok (nothing to commit)" when it actually succeeded → verify
  with `rtk git log --oneline`.
- Pre-commit `check:self-knowledge` may need `pnpm self-knowledge:generate` first.
- `BootSplash` on `/chat` swallows clicks — wait for it to clear before live-verifying, and
  click by element ref, not pixel coordinates.
- Playwright MCP dumps screenshots into the repo root; `.superpowers/` is gitignored.
- Pre-existing flake, not ours: `apps/api/src/runner/runner-core.test.ts`.
- The shell body is now the scroll container, not the document, so Playwright's
  `fullPage: true` captures only the viewport — scroll the inner container instead.
- **Verify subagent tooling claims.** F3's subagent reported a TS6059 failure as a
  "pre-existing baseline issue"; re-running it directly showed it clean. An inherited false
  excuse would have let a genuinely red typecheck ride for the rest of the arc.
- Before calling a layout issue a defect, measure it (`clientWidth` vs `scrollWidth`). F5
  nearly "fixed" a deliberately pannable canvas that was working correctly.
