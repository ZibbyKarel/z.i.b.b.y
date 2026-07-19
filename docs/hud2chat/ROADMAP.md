# HUD → Chat UI migration — roadmap

**Goal (operator, 2026-07-19):** the operator must be able to run the whole system from
the Chat UI **without ever jumping out of the new design**. Every HUD surface either
dissolves into Chat UI, or is rewritten into the new immersive full-page shell that Chat
links to. Breaking the _old_ HUD visually is an accepted cost of the migration.

**Orchestrator:** Opus (plans, reviews, commits). **Impl:** Sonnet `general-purpose`
subagents — they write code, they do **not** commit.
**Branch:** `feat/hud-to-chat-migration` (off `main` @ 32ce9b9e). **Park at the PR gate** —
no push, no PR (Tier-3, operator merges).

## Source of truth

- Audit: `docs/web/hud-to-chat-migration-gap.md`
- Design (read-only): `design/Z.I.B.B.Y/ZIBBY Archiv úloh.html` (the ONLY genuine full-page
  surface in the design corpus — it defines the sub-page chrome contract),
  `design/Z.I.B.B.Y/zibby/velin-d.jsx` (AppD), `ZIBBY Design Audit.html` (token discipline).
  `ZT.*` is **design vocabulary**, not runtime tokens — runtime is
  `libs/design-system/src/themes/darkTheme.ts` + `stateTone.ts`.
- Decisions: `docs/hud2chat/DECISIONS.md` · Progress: `docs/hud2chat/PROGRESS.md` ·
  Recovery: `docs/hud2chat/HANDOFF.md`

## The design's sub-page chrome contract (from Archiv úloh)

No orb map. No dock/rail/bottombar. A single thin header = round back-to-orb button +
title + subtitle, then the content frame. Same token set as `/chat`. That is what the new
`ImmersiveShell` implements — see D1.

## Phases

| #   | Phase                      | Surface                                                               | Status |
| --- | -------------------------- | --------------------------------------------------------------------- | ------ |
| F0  | Immersive shell foundation | DS `ImmersiveShell` + AppShell immersive route mode                   | ⬜     |
| F1  | Settings                   | `/settings` → immersive (operator's named reference case)             | ⬜     |
| F2  | Archive of tasks           | new `/archiv` master/detail; chat gutter links to it                  | ⬜     |
| F3  | Catalogs A                 | `skills`, `commands`, `mcp`, `hooks` (list + detail)                  | ⬜     |
| F4  | Catalogs B                 | `agents`, `automations` (list + detail)                               | ⬜     |
| F5  | Orchestration              | `pipelines`, `chains` (list+detail share one Screen via selectedId)   | ⬜     |
| F6  | Delivery entities          | `projects` (+ `/new`, integrations detail), `companies`               | ⬜     |
| F7  | Memory + gates             | `/memory`, `/gates`                                                   | ⬜     |
| F8  | Overview dissolution       | status line, limits, briefing-as-chat-message; delete `/overview`     | ⬜     |
| F9  | Chat reachability sweep    | every surface reachable from Chat; orphans killed                     | ⬜     |
| F10 | Old shell deletion         | remove `MainLayout`/`Sidebar`/`RightRail`/`TopBar`, simplify AppShell | ⬜     |

Legend: ⬜ not started · 🔩 in progress · 🔎 in review · ✅ done · ⛔ blocked

**Ordering rationale:** F0 must land first (everything depends on the shell). F1 is
deliberately the operator's own example — it validates the shell on a real page before we
scale. F2 is the one genuinely _new_ page and has a literal design reference. F3→F7 are
mechanical conversions, easiest→hardest, so the shell hardens before it meets
`projects/ProfileScreen.tsx` (685 LOC, the biggest single screen). F8–F10 are only safe
once nothing still needs the old chrome.

## Per-phase loop

1. Opus writes `docs/plans/hud2chat-F<N>-*.md` (JIT, at most one phase ahead).
2. Dispatch Sonnet `general-purpose` subagent with the plan as the brief.
3. Opus reviews the diff against the plan + `.claude/skills/design-system/SKILL.md`.
   Rework → back to the subagent with specifics.
4. `pnpm exec prettier --write` + `eslint --fix` on touched files → `pnpm check:lint` →
   `tsc -p apps/web` (**directly** — `rtk pnpm typecheck` lies) → scoped vitest.
5. Commit per phase. Update `PROGRESS.md` + this table + `HANDOFF.md` **immediately**.

## Guardrails

- **DS-first.** Compose from `libs/design-system`. A missing primitive is an explicit
  decision: add to DS, or keep as a domain composite in `apps/web/features/<domain>/components/`.
- No raw inline `style`/Tailwind on DOM nodes in `apps/web` (ESLint `react/forbid-dom-props`)
  except sanctioned scene layers. Dynamic values go through a DS `style` passthrough.
- React 19 — never `forwardRef`. No `any`. `noUncheckedIndexedAccess` is on.
- Every new component: `<Name>TestId` enum + `data-testid` + co-located jsdom test;
  `getByTestId` is the PRIMARY selector, roles/ARIA stay as assertions.
- i18n: `useTranslations`, English defaults in DS, `cs`/`en` catalogs (default **cs**).
- **pnpm only.** Prefix shell commands with `rtk`.
