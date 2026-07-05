# Pattern extraction (M4)

> North-star: ZIBBY "**proposes — new automation rules**".

The **PatternExtractorService** (`apps/api/src/patterns/pattern-extractor.service.ts`)
scans 30 days of approval-decision activity for recurring `action` + `decision`
pairs and drafts plain-English gate-rule proposals into the vault, feeding the
morning briefing's "What I learned" section.

No contract or controller exists for this module — it has no HTTP surface. It runs
only as a scheduled automation and is read back through the vault note it writes.

## Pieces

| Piece    | File                                                       | Role                                                                            |
| -------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Service  | `apps/api/src/patterns/pattern-extractor.service.ts`         | `extract()` tallies patterns and writes proposals; `readProposals()` reads them back |
| Module   | `apps/api/src/patterns/patterns.module.ts`                   | imports `MemoryModule` (vault write); `ActivityLogService`/`LoggerService` come from global modules |

## Flow

1. `extract(now)` reads the past 30 days of activity (`ActivityLogService.readRange`)
   and keeps entries whose `kind` is `approval-approved` or `approval-rejected` and
   that carry `refs.action` + `refs.decision`.
2. Entries are tallied by `action:decision` key. A pair seen **≥ 3×** qualifies as an
   `ApprovalPattern`; the top 10 (by count) are kept. The same action can produce
   two separate patterns — one `approved`, one `rejected` — if both cross the
   threshold independently.
3. Each pattern becomes a proposal sentence: `Always allow "<action>" (approved N×
   in the past 30 days)` or the `deny` equivalent for rejected patterns.
4. Non-empty proposal lists are written as `- [ ] …` bullets to the vault note
   `patterns/suggestions` (`updateNote`, falling back to `createNote`).
5. `readProposals()` parses the `- [ ]` / `- [x]` bullet lines back out of the note
   body for the morning briefing.

**Proposes ≠ acts.** Like `GapDetector` (`docs/api/gaps.md`) and the app-ideas
generator (`docs/api/ideas.md`), this service only writes a vault note describing a
candidate gate rule; turning a proposal into an actual rule is an operator decision
— "Approve each line to turn it into a gate rule" is the note's own closing line.
Reading is the only side effect on the activity log; the vault write is idempotent
(it always overwrites the whole suggestions note, never appends).

## Scheduling

The `pattern-extract` automation target (`apps/api/src/automations/scheduler.service.ts`)
dispatches `extract()` nightly alongside the other consolidation jobs (see
`docs/api/automations.md`); the run ref is `patterns:<count>`. Deterministic — no
`claude` call.
