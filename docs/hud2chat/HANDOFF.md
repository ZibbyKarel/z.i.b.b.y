# HUD → Chat UI migration — handoff / recovery

If this session dies, resume from here.

## Where things stand

Branch `feat/hud-to-chat-migration`, off `main` @ 32ce9b9e. **PARKED at the PR gate —
nothing pushed, no PR** (Tier-3: the operator reviews and merges). Do NOT work on `main`.

Read in this order: `ROADMAP.md` (phases + loop) → `DECISIONS.md` (O1–O4 operator calls,
D1–D6 architecture) → `PROGRESS.md` (live truth, per-route ledger).

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
- `AppShell` forks on a single hardcoded `pathname === "/chat"` check — there is no
  per-route shell table yet. F0 introduces one (D2).
- `GlassSurface` exists (`libs/design-system/src/immersive/`) but there is **no** reusable
  full-page immersive layout — `ChatScreen.tsx` hand-assembles its own.
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
