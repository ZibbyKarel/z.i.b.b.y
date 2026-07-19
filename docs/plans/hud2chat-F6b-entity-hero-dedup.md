# F6b — Resolve the EntityHero / immersive-header duplication (D13)

Part of the HUD → Chat UI migration. **Read D13 in `docs/hud2chat/DECISIONS.md` first** — this
phase is the deferred decision it describes, now due because every `EntityHero` consumer has
been migrated (F4, F5, F6) and we finally know all of them.

## The problem, verified
On `/agents/[id]` (and `/pipelines/[id]`, and `/pipelines` with its master/detail preview),
the immersive header shows the entity's name, and `EntityHero` immediately below repeats that
name as a heading plus the full description. The bands are visually distinct — a thin glass
bar over a tall image panel — so it does not read as a doubled toolbar, but the *text* is
duplicated.

## The four consumers, and why a naive fix breaks two of them

| Consumer | Has an immersive header above it? |
| --- | --- |
| `features/agents/DetailScreen.tsx` | **yes** — duplicates |
| `features/pipelines/Screen.tsx` | **yes** — duplicates |
| `features/runs/components/RunDetail.tsx` (used by `/archiv` and `/runs`) | **no** — the archive header says "Archiv úloh", not the run name |
| `features/chat/components/ChatDetailDialog.tsx` | **no** — a dialog, no page header at all |

So stripping identity from `EntityHero` unconditionally would leave the run detail and the
chat dialog with an anonymous image band. The fix must be **opt-in per call site.**

## The decision

Give `EntityHero` a boolean prop — suggested name `showIdentity`, **defaulting to `true`** so
all four consumers are unchanged until they opt out. When `false`, the hero renders as the
image/gradient band only, without its name heading and description block; the page's
immersive header carries the identity instead.

Pass `showIdentity={false}` from exactly the two duplicating call sites:
`features/agents/DetailScreen.tsx` and `features/pipelines/Screen.tsx`.

Do **not** change `RunDetail` or `ChatDetailDialog`.

If, on reading the component, a different shape is clearly better (e.g. the hero already has a
`children` override that makes a prop unnecessary), take it — but say so in your report with
the reasoning, and keep the "default is unchanged for all four consumers" property either way.

## Verification
- `pnpm exec prettier --write` + `eslint --fix` on touched files; `pnpm check:lint`.
- `npx tsc -p apps/web --noEmit` and `npx tsc -p libs/design-system --noEmit` — tsc DIRECTLY.
  Both are known-clean; any error is yours.
- Scoped vitest (`web-components`, `@zibby/design-system`). Add a DS test asserting both
  states, and keep the existing `EntityHero` tests passing unchanged — if one needed editing,
  the default was not preserved.
- **Live browser check at 1680px, all four surfaces:** `/agents/architect` and
  `/pipelines/code-audit` (identity should now appear exactly once), plus `/archiv` with a run
  selected and the chat detail dialog (identity must still appear — these are the regression
  risks, not the fix).

## Out of scope
Restructuring `EntityHero`'s layout, image handling or upload affordances. Any other page.
**Do not commit.**
