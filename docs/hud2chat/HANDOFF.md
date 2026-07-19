# HUD → Chat UI migration — handoff / recovery

If this session dies, resume from here.

## Where things stand

Branch `feat/hud-to-chat-migration`, off `main` @ 32ce9b9e. **PARKED at the PR gate —
nothing pushed, no PR** (Tier-3: the operator reviews and merges). Do NOT work on `main`.

Read in this order: `ROADMAP.md` (phases + loop) → `DECISIONS.md` (O1–O4 operator calls,
D1–D13 architecture) → `PROGRESS.md` (live truth, per-route ledger).

**THE ARC IS COMPLETE.** Every phase F0 through F10b is committed; the roadmap has no open
items. `996872fc` is the tip. Nothing is in flight, and there is no next phase to pick up —
if you are reading this after a crash, the correct action is to **verify, not to continue**:
`rtk git log --oneline` should show 11 feature commits plus docs commits on top of
`32ce9b9e`, and the branch should be clean.

The whole HUD chrome is gone (`MainLayout`, `Sidebar`, `RightRail`, `TopBar`), `/overview`,
`/runs` and `/gates` are deleted or redirect shims, and every surviving route runs on the
immersive shell with `/chat` as home. The reachability audit — the arc's proof that the goal
was actually met — is `docs/web/chat-reachability.md`.

Two things deliberately left for the operator, both named rather than silently skipped:
the `/chat` composer's `autoFocus` means the first Tab lands in the composer rather than the
skip link (pre-existing, not from this arc), and a broader accessibility audit beyond
landmarks was ruled out of scope for a regression fix.

**The reusable migration recipe is the 9 numbered steps in
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
- **Verify with exit codes, not output text (D20).** F3's subagent reported a TS6059 failure;
  I re-ran it, saw "TypeScript: No errors found", and wrote the claim up as false. It was not.
  The `rtk` filter prints success text while passing the non-zero exit code through, so both
  the subagent and my rebuttal were reading the same lying output. `libs/design-system` was
  genuinely red for most of the arc (fixed in `b33e8db5`). Always:
  `npx tsc -p <proj> --noEmit; echo $?` — and trust the number, not the sentence.
- **Check a subagent's findings separately when it bundles them.** F8d reported two lost
  capabilities in one breath; one was real (briefing generation had zero callers), one was
  false (approvals stayed reachable). A bundle is not a unit of truth (D21).
- Before calling a layout issue a defect, measure it (`clientWidth` vs `scrollWidth`). F5
  nearly "fixed" a deliberately pannable canvas that was working correctly.
- **Never pipe `grep` into a redirect that overwrites its own input.** `rtk` transparently
  rewrites `grep`, so `grep -v X file > file` does not do what plain shell semantics suggest —
  it corrupted a chat transcript in F8a. Write to a temp file and move it into place.
- Chat transcripts are append-only JSONL under `.zibby/data/chat/` (gitignored). Any contract
  change to `ChatMessageSchema` must keep old lines parsing — verify against real lines on
  disk, never by reasoning. `node -e` over each file is a fast integrity check.
