# Phase 64 — Run detail: move the task description into a collapsible "Vstup" section

> TODO (line 15): _"Stránka Běhy a aktivita - Detail běhu - dlouhé popisy úkolů - Popisy budou
> často dlouhé a budou obsahovat přílohové soubory. Nebudeme to cpát do headeru ale vytvoříme
> novou sekci pod ním »Vstup« která bude defaultně sbalená a po rozbalení ukáže kompletní
> naformátovaný vstup úkolu spolu s možností otevřít všechny přílohové soubory."_

This phase does the UI restructure (the collapsible "Vstup" section, formatted input, attachments listed).
The "open the attachment files" capability needs a backend serve endpoint and is **phase 65** — this phase
lists attachments (as today) inside the new section; phase 65 makes them openable.

## Current state (`apps/web/features/runs/components/RunDetail.tsx`)

- The task description renders INSIDE the header (EntityHero overlay) via
  `{descriptionText && <TaskDescription text={descriptionText} />}` (~line 502). `TaskDescription` is a
  local component with a 180-char preview + "show more/less". `descriptionText` (~line 447) is
  `run.taskText` when it differs from the headline/subtitle.
- Attachments render in a separate `RunAttachmentsPanel` (`HudPanel` titled from `tasks.attachments`,
  ~line 336 def, rendered ~line 595) below the header as a `FilePreview` list.

## Change

1. **Remove the description from the header** — delete the `{descriptionText && <TaskDescription/>}`
   line from the EntityHero overlay. The header keeps headline + state + meta line + meta strip only.
2. **Add a new collapsible "Vstup" section BELOW the header**, default **collapsed**, using the DS
   `Accordion`/`AccordionItem` (already used in this file for the output panel, ~line 605). Title it
   "Vstup" (add an i18n key e.g. `runs.inputSection` = cs "Vstup" / en "Input"). Place it directly under
   the header `Card`, above `RunOutputPanel`.
   - Inside: render the **complete, formatted** task input as markdown via the DS `Markdown` component
     (exported from `@zibby/design-system`) — use the FULL input (`run.taskText` — the whole description,
     NOT the 180-char-truncated preview). If `run.taskText` is empty/undefined, and there are also no
     attachments, don't render the section at all (nothing to show).
   - Below the formatted input, render the **attachments** (fold in the current `RunAttachmentsPanel`
     content — the `FilePreview` list). Keep it read-only here; phase 65 adds the open affordance. You may
     either move `RunAttachmentsPanel`'s body into the section or render it inside the accordion; remove
     the now-separate `RunAttachmentsPanel` render below the header so attachments live ONLY in "Vstup".
   - `TaskDescription` (the 180-char preview component) is no longer needed for the header; if nothing
     else uses it, remove it (grep first). The "Vstup" section shows the full input (the accordion IS the
     collapse affordance now), so the per-text show-more/less is redundant.
3. Default collapsed: the `AccordionItem` starts closed (check the DS Accordion API for the default-open
   prop; ensure it defaults closed).

## Tests (`RunDetail.test.tsx`)
- The header no longer renders the description inline; a collapsed "Vstup" section exists below it; when
  expanded it shows the full task text (markdown) and the attachment names. Keep the attachment assertions
  (names/sizes present once expanded). Migrate selectors; keep the assertion set. If a test asserted the
  header's truncated description, move that assertion to the expanded "Vstup" section.

## Verification (run, paste real output — no success claim without it)
- `npx tsc -p apps/web/tsconfig.json --noEmit` clean.
- `npx eslint apps/web/features/runs` clean.
- `rtk proxy npx vitest run apps/web/features/runs` green modulo the KNOWN pre-existing reds (RunDetail
  cost-cell cs-locale; TaskCard ×2) — confirm via `git stash`.

## Constraints
- React 19 (NO forwardRef), no `any`, no raw inline DOM `style` in apps/web. Use DS `Accordion`/
  `AccordionItem`, `Markdown`, `FilePreview`, `Stack`, `HudPanel`/`Panel`, `Typography`.
- Do NOT touch operator WIP: `PipelineStageTimeline.tsx`, `.zibby/data/**`, `RunLogStream.tsx`,
  `machine.*`, `design/*`, chat internals, CommandLine, EntityHero, MenuButton, MetaCell (unless a phase-62
  change requires it — it shouldn't). Build on top of phases 60/61/62/63 (don't revert the hero/kebab/
  meta-strip/worker-link work). Only edit `RunDetail.tsx` (+ its test) and the i18n catalogs
  (`apps/web/i18n/messages/{cs,en}.json`, add the one section-title key). Do NOT git commit — the caller
  commits. A pre-commit drift gate may complain about `.zibby/data/agents/_categories.json` (operator WIP)
  — ignore it.
