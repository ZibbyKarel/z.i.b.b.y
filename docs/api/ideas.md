# App ideas (M6 weekly bonus)

> North-star: ZIBBY "**proposes — new automation rules ... app ideas**".

The **IdeaGeneratorService** (`apps/api/src/ideas/idea-generator.service.ts`) is a
small weekly bonus on top of the research layer: it pairs the operator's configured
research interests with the freshest trends from the latest research digest into up
to three prototype pitches, written to the vault for the morning briefing.

No contract or controller exists for this module — it has no HTTP surface. It runs
only as a scheduled automation and is read back through the vault note it writes.

## Pieces

| Piece   | File                                                | Role                                                                        |
| ------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| Service | `apps/api/src/ideas/idea-generator.service.ts`       | `generate()` pairs interests × trends; `readIdeas()` reads the note back      |
| Pairing | `pairIdeas()` (same file, exported pure function)    | zips trends with interests (cycling interests if fewer than trends), capped at 3 |
| Module  | `apps/api/src/ideas/ideas.module.ts`                 | imports `ResearchModule` (config + latest digest) and `MemoryModule` (vault write) |

Consumed via `ResearchConfigStore.read()` (the operator's `interests` list) and
`ResearchService.latest()` (the freshest digest items) — see `docs/api/research.md`.

## Flow

1. `generate(now)` reads the operator's research config and the latest research
   digest concurrently.
2. `pairIdeas(interests, trends)` zips up to 3 trend items with interests (cycling
   through the interest list if there are fewer interests than trends) into
   `{ title, rationale }` pairs. Empty inputs (no interests or no trends) produce
   an empty result — the generator stays quiet rather than inventing noise.
3. Non-empty results are formatted as `- [ ] title — rationale` bullets and written
   to the vault note `suggestions/app-ideas` (`updateNote`, falling back to
   `createNote` if the note doesn't exist yet).
4. An `app-ideas-generated` activity entry is recorded regardless of whether any
   ideas were produced.
5. `readIdeas()` parses the `- [ ]` / `- [x]` bullet lines back out of the note body
   for the morning briefing to include.

**Proposes ≠ acts.** Like the `GapDetector` (`docs/api/gaps.md`), this service only
writes a vault note; approving an idea into an actual build is an operator action —
"approve one to spin up a build goal" is the note's own closing line.

## Scheduling

The `app-ideas` automation target (`apps/api/src/automations/scheduler.service.ts`)
dispatches `generate()` alongside the other consolidation jobs (see
`docs/api/automations.md`); the run ref is `ideas:<count>`. Deterministic — no
`claude` run; the pairing logic is pure and needs no LLM.
