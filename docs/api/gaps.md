# Gap detection (M5)

> North-star: ZIBBY "**self-modifies — detects gaps, implements fixes, opens PRs on itself**"
> and "**proposes — new automation rules**".

The **GapDetector** (`apps/api/src/gaps/gap-detector.service.ts`) is the proactive
front door to self-modification. It scans the past 30 days of `task-created` activity
for recurring manual work — tasks the operator (or a channel) keeps creating by hand —
and drafts "I noticed X — automate it?" suggestions for the morning briefing.

## Flow

1. `detect()` reads 30 days of activity (`ActivityLogService.readRange`) and keeps the
   `task-created` entries.
2. Each summary is normalised (lowercase, punctuation→space, collapsed, capped 80 chars)
   and tallied. A normalised summary seen **≥ 3×** is an automation gap.
3. The top 10 gaps are written to `vault/suggestions/automation-gaps.md` as
   `- [ ] You created N similar tasks ("…") — automate it?` bullets.
4. The morning briefing reads the top 5 into its **"Gaps I noticed"** section
   (`Briefing.automationGaps`).

**Proposes ≠ acts.** The GapDetector only writes a vault note; it never creates an
automation or dispatches anything. Approving a suggestion is an operator action.

## Scheduling

The `gap-detect` automation target (`data/automations/gap-detect.json`, `0 23 * * *`)
runs nightly alongside the other consolidation jobs. Deterministic — no `claude` run.

## Relationship to the rest of self-modification

The *back half* of self-modification already exists: the classifier routes a
self-modification intent to the delivery pipeline against ZIBBY's own repo, the goal
loop builds it in an isolated sibling worktree (builder ≠ subject), and the locked gate
floor forces every PR through approval (`pr.open → ask`, `pr.merge → deny`). The
GapDetector supplies the *front half* — noticing what's worth changing in the first place.
