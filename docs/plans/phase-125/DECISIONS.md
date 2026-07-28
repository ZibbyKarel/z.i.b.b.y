# Phase 125 — decision log

Decisions taken **during implementation**, on top of the ones already fixed in the master
plan's _"Decisions taken (do not re-litigate)"_ table. Newest last. Every entry: what was
asked, what was chosen, why, and what it costs.

---

## D-001 — Board columns: 4, not the mock's 3

**Context.** `design/Z.I.B.B.Y/ZIBBY Roadmap.html` renders `To Do | In Progress | Done`.
The master plan mandates `BLOKOVANÉ | READY | IN PROGRESS | DONE`.

**Decision.** The plan wins — 4 columns, BLOKOVANÉ first. The mock predates the dependency
gate; a blocked item that silently sits in "To Do" is exactly the failure the phase exists to
prevent. Putting BLOKOVANÉ first makes the thing that needs the operator's attention the
first thing read.

**Cost.** Narrower columns at the same width. Mitigated by the card being compact and the
left epic list collapsing on narrow viewports.

## D-002 — Everything else in the mock is honoured

The mock's visual grammar is adopted as-is and rebuilt from DS primitives (no inline styles):

- Left rail ~33%: epic rows = subsystem-hued icon tile, title + subsystem tag, description,
  progress bar with `done/total tasků`, status pill on the right. `nerozfázováno` in italic
  mono when the epic has no children.
- Right: a mono, uppercase, letter-spaced board header `‹epic title› — task board` preceded
  by a hue dot.
- Columns are panels with a mono uppercase label + count; empty columns show a dashed
  `prázdno` placeholder.
- Cards are compact, `Z.bg0` on `Z.line`, 6px radius.

The card gains what the plan's spec requires and the mock lacks: external ID link, truncated
description, play button, dependency badges.

## D-003 — Recovery/handoff files live in `docs/plans/phase-125/`

`PROGRESS.md` (handoff state), `ROADMAP.md` (execution order), `DECISIONS.md` (this file).
Committed with every wave so a limit-outage can resume from `git log` + `PROGRESS.md` alone.
