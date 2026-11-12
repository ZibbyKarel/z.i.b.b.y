# Gap detection (M5)

> North-star: ZIBBY "**self-modifies — detects gaps, implements fixes, opens PRs on itself**"
> and "**proposes — new automation rules**".

The **GapDetector** (`apps/api/src/gaps/gap-detector.service.ts`) is the proactive
front door to self-modification. It scans the past 30 days of `task-created` activity
for recurring manual work — tasks the operator keeps creating by hand —
and drafts "I noticed X — automate it?" suggestions for the morning briefing.

## Flow

1. `detect()` reads 30 days of activity (`ActivityLogService.readRange`) and keeps the
   `task-created` entries with `refs.manual: true` — tasks the operator made by hand
   (New Task dialog, composer, quick action). Tasks from autopilot, the PR inbox flows
   (review, address comments, rebase, fix-CI), automations, channels, the roadmap and
   retries carry no flag and never count: they already run without the operator.
2. Each summary is normalised (lowercase, punctuation→space, collapsed, capped 80 chars)
   and tallied. A normalised summary seen **≥ 3×** is an automation gap.
3. The top 10 gaps are written to `vault/automation-gaps.md` as
   `- [ ] You created N similar tasks ("…") — automate it?` bullets.
4. The morning briefing reads the top 5 into its **"Gaps I noticed"** section
   (`Briefing.automationGaps`).

**Proposes ≠ acts.** The GapDetector only writes a vault note; it never creates an
automation or dispatches anything. Approving a suggestion is an operator action: the
Bridge Proposals widget's **Approve** opens the create-automation dialog prefilled
from the gap's most recent task (`provenance.taskId`). The prompt prefills in this order:
the sample task's text, else `provenance.sample` (the recurring task's title), else the
quoted part of a legacy suggestion's text; once the automation is created
the proposal is decided `approve`.

## Structured proposals (TODO 14)

Each gap is also upserted as a `gap-detect` proposal (dedupe key = the normalised
pattern, provenance `{ automationId, noteId: "automation-gaps", taskId, sample }`).
An open gap proposal the run no longer reports is expired on the spot
(`ProposalsService.expireUnseen`) instead of lingering for 30 days.
Dismissed and approved proposals are left out of the note; edited ones are written with their
`editedText`. When no gap qualifies, the existing note is still cleaned of
dismissed lines. See `docs/api/proposals.md`.

## Scheduling

The `gap-detect` automation target (`data/automations/gap-detect.json`, `0 23 * * *`)
runs nightly alongside the other consolidation jobs. Deterministic — no `claude` run.

## Relationship to the rest of self-modification

The _back half_ of self-modification already exists: the classifier routes a
self-modification intent to the delivery workflow against ZIBBY's own repo, the goal
loop builds it in an isolated sibling worktree (builder ≠ subject), and the locked gate
floor forces every PR through approval (`pr.open → ask`, `pr.merge → deny`). The
GapDetector supplies the _front half_ — noticing what's worth changing in the first place.
