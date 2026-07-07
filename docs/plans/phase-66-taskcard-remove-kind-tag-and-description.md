# Phase 66 — Run card (TaskCard): remove the top-right kind tag and the description

> TODO (line 17): _"Stránka Běhy a aktivita - Karta běhu - odstraníme informaci zobrazovanou
> v pravém horním rohu (agent/pipeline/naplánovaný task) a odstraníme description."_

## Target

`apps/web/features/runs/components/TaskCard.tsx` (+ its test `TaskCard.test.tsx`). This is a run **card**
in the task feed (master list) — NOT the run detail. Independent of the RunDetail header work.

## Changes

1. **Remove the top-right kind tag** — `<Tag>{t(\`kind.${run.kind}\`)}</Tag>` (~line 93), the
   agent/pipeline/scheduled-task label in the card's top-right corner. After removal, the header row
   (`<Stack align="start" direction="row" gap="100" justify="between">`) has only the left block
   (IconTile + headline). Simplify the row so it reads cleanly without a right-hand element — the
   `justify="between"` is no longer needed (the left `Container grow minW0` already fills the width); drop
   it or keep the Stack minimal, whichever is cleanest. Remove the now-unused `Tag` import if nothing else
   in the file uses it.
2. **Remove the description** — the `{run.prompt && run.prompt !== headline && (<Typography …>{run.prompt}</Typography>)}` block (~lines 95–99). Delete it entirely.

Keep everything else: the IconTile glyph + headline, the task-origin line (`taskLine`), the status
caption (held/queued/paused/deferred), the progress bar, the RunStateBadge + footer. Do NOT change the
card's tone/edge/living behavior.

## Tests (`TaskCard.test.tsx`)
- Remove/adjust any assertion that the kind tag (e.g. "skill"/"pipeline") or the `run.prompt` description
  renders. Keep the other assertions (headline, task-origin line, state badge, captions, footer).
- **Known pre-existing reds (do NOT try to fix — they fail on the untouched branch too):**
  `TaskCard > renders the task-origin line and the written-back outcome badge` and
  `TaskCard > marks a failed task outcome as selhání`. Confirm via `git stash` they still fail identically
  after your change; don't chase them. If your removal happens to change how those tests fail, only update
  the parts strictly about the removed kind-tag/description; leave the outcome-badge expectations as they
  are (they assert a not-yet-built badge — out of scope).

## Verification (run, paste real output — no success claim without it)
- `npx tsc -p apps/web/tsconfig.json --noEmit` clean.
- `npx eslint apps/web/features/runs` clean.
- `rtk proxy npx vitest run apps/web/features/runs` — green EXCEPT the known pre-existing reds (RunDetail
  cost-cell cs-locale; the two TaskCard outcome-badge tests). Confirm via `git stash`.

## Constraints
- React 19 (NO forwardRef), no `any`, no raw inline DOM `style` in apps/web.
- Do NOT touch operator WIP or other phases' files: `PipelineStageTimeline.tsx`, `.zibby/data/**`,
  `RunLogStream.tsx`, `machine.*`, `design/*`, chat internals, CommandLine, EntityHero, MenuButton,
  `RunDetail.tsx` (that's phases 63/64). ONLY edit `TaskCard.tsx` (+ its test). Do NOT git commit — the
  caller commits. A pre-commit drift gate may complain about `.zibby/data/agents/_categories.json`
  (operator WIP) — ignore it.
