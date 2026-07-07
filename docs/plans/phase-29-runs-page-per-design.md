# Phase 29 — /runs page per the design (task header + pipeline log)

> TODO: _"implementovat /runs podle designu (design je momentálně stažený aktuální
> ve složce design). Zejména hlavička tasku a log pipeliny musejí sedět."_

## Goal

Align the `/runs` page to the target design — **especially the task/run header and the
pipeline log**. The structure already exists; this is a fidelity pass to the design
reference, applying the audit's rules ("tichý velín": color=state, glow/pulse ONLY for
what's live).

## Design reference

- Screenshot: `design/Z.I.B.B.Y/screenshots/v-runs.png` (the target /runs layout).
- Also: `01/02-check-runs.png`, `v-states.png` (state chips), `design/Z.I.B.B.Y/redesign/hud-after.jsx`.
- Audit: `design/Z.I.B.B.Y/ZIBBY Design Audit.html`. Tokens ALREADY match the audit in
  `libs/design-system/src/themes/darkTheme.ts` + `theme/globals.css` (verified) — this is
  component-level application, not a token change. (One known token drift to reconcile:
  `colorForegroundFaint` `#7a8793` in darkTheme vs `#66737f` in globals/audit — leave as-is
  unless the design pass needs it; it was set to `#7a8793` for WCAG AA.)

### Target spec (read from v-runs.png)

**Page header**: title "Běhy & aktivita" + subtitle "N běží · N čeká · N celkem"; a
right-aligned **segmented status filter** (Vše / Běží / Čeká / Hotovo / Chyba / Přerušeno)
each with a count, the active segment highlighted.

**Left column — run/task cards** (one per run): each card has
- a **left border accent in the run's state color** (running=blue `run`, waiting=amber
  `wait`, done=green `ok`, error=red `bad`); only a live (running/waiting) card may carry
  any glow — done/error are matte;
- glyph IconTile + mono title + a small type tag top-right ("skill"/"pipeline");
- a one-line description;
- a **progress bar** tinted in the state color with a `NN%` label (running shows partial,
  done shows 100%);
- a **state chip** bottom-left (BĚŽÍ / ČEKÁ NA TEBE / HOTOVO / CHYBA) using the single
  shared state vocabulary;
- project name + relative time bottom-right (mono, dim).
- The selected card gets a full accent border.

**Right column — RunDetail header** (the "hlavička tasku" that must match):
- glyph IconTile + mono title + state chip inline; a description line; a meta line
  "TMDB-3041 · skill · agent Kurátor" (id · kind · agent);
- right cluster: a **danger "Zastavit běh"** (Stop) button for a live run (or the
  approval severity/risk cluster for a waiting-approval run — keep existing behavior).
- **Meta strip** below: labeled cells PROJEKT / SPUŠTĚNO / TRVÁNÍ / **CENA** (cost in the
  green `ok` tone). Labels are 11px mono uppercase tracked; values are the data type.

**Right column — output / pipeline log** (the "log pipeliny" that must match):
- a "// VÝSTUP BĚHU" section; inside, a **"ŽIVÝ LOG"** panel with a pulse icon +
  "N řádků" count, terminal-style lines `HH:MM  SYS/INFO/OK  message` (mono, tag-colored),
  and a progress bar with `NN%` at the bottom — **pulse only while the run is live**.
- For a PIPELINE run, the log is the stage timeline: one row per stage (phase · attempt ·
  verdict tag · state badge · expandable per-stage log), matte unless the stage is live.

## Current implementation (recon anchors)

- Route `apps/web/app/(dashboard)/runs/page.tsx` → `apps/web/features/runs/Screen.tsx`
  (two-column Grid; left = `TaskCard` list, right = `RunDetail`; `PageHeader` + status
  filter). NOTE: Phase 24 already removed the `?project=` in-screen dropdown.
- `apps/web/features/runs/components/RunDetail.tsx` — header `HudPanel` (:372-498), meta
  strip `MetaCell` row (:451-496), assign-project control (Phase 24), output/`RunLogStream`
  wiring (:355-367), pipeline timeline (:534-540).
- `apps/web/features/runs/components/PipelineStageTimeline.tsx` (:159-227) + `StageLog`/
  `LiveStageLog`/`TerminalStageLog` (:35-102).
- `apps/web/features/runs/components/RunLogStream.tsx` (:27-52) + `RunTranscript.tsx`.
- `apps/web/features/runs/components/RunStateBadge.tsx` — the state chip (must be the single
  shared state vocabulary; align its tones to `ok/run/wait/bad`).
- `TaskCard` (left-column card) — find under `features/runs/components/`.

## Approach

1. Open `v-runs.png` (and `v-states.png`) and RUN THE APP (`/runs`) to screenshot the
   current state; enumerate concrete diffs between current and target for (a) the cards,
   (b) the header + meta strip, (c) the ŽIVÝ LOG / stage timeline.
2. Apply the diffs using DS primitives + existing tokens:
   - Card: left state-accent border, state-tinted progress bar, state chip, matte-unless-live.
   - Header: id·kind·agent meta line; Stop button as danger; meta strip PROJEKT/SPUŠTĚNO/
     TRVÁNÍ/CENA with CENA in `ok` green; labels as 11px mono tracked.
   - ŽIVÝ LOG: pulse only when live; line-count; terminal tag colors (SYS/INFO/OK/ERR);
     bottom progress bar.
   - Enforce "glow/pulse only for a running run or a waiting approval" everywhere on this
     surface; matte all done/error progress + dots.
3. Keep state color/vocabulary single-sourced (RunStateBadge / a shared state map) so the
   cards, header chip, and log all agree — `run #7aa5f8` distinct from `accent #5b8def`.

## Files touched (expected)
- `apps/web/features/runs/Screen.tsx` (page header + status filter fidelity)
- `apps/web/features/runs/components/RunDetail.tsx` (header + meta strip)
- `apps/web/features/runs/components/{TaskCard,RunStateBadge}.tsx` (cards + state chip)
- `apps/web/features/runs/components/{RunLogStream,PipelineStageTimeline}.tsx` (log)
- possibly a shared run-state → tone/label map if one isn't already canonical
- i18n for any label wording that must match the design (cs default + en)

## Verification
- `pnpm lint`(scoped — never bare, it reformats design mockups)/`pnpm typecheck`/`pnpm test`
  green modulo known pre-existing failures (confirm via `git stash`).
- Run the app, screenshot `/runs` for a running skill run, a waiting-approval run, and a
  pipeline run; compare side-by-side with `v-runs.png` — header, meta strip, and log must
  match; only live runs glow/pulse.
- Keep RunDetail/RunStateBadge/PipelineStageTimeline tests green (adjust assertions that
  encode old labels/tones intentionally, not to paper over regressions).

## Relationship to Phase 28 (broad design alignment)
Phase 28 is the app-wide audit sweep (glow-only-when-live everywhere, remove scanlines/grid
overlays, focus-ring, radius/spacing consistency). This phase (29) is the deep, pixel-level
pass on the runs surface specifically. Do 29's shared state-map work in a way Phase 28 can
build on. Order: either can go first; if Phase 28 lands the shared state map + global glow
rules first, Phase 29 inherits them.
