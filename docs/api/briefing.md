# Briefing (Phase 6.2)

> "Two bugs came in overnight — both fixed, PRs up for review. Company X asked about
> feature Y; I answered. Nothing else needs you." — the butler's briefing, not a
> firehose.

The briefing is ZIBBY's accountability surface: a single assembled snapshot of
**what needs the operator**, **what ZIBBY already did**, and **what it's watching**,
built entirely from durable records elsewhere in the system (approvals, parked runs,
channel items, the activity log). Assembly is pure and side-effect-free; generation
additionally persists the result as a vault note and advances a cursor so a re-brief
is idempotent.

## Pieces

| Piece           | File                                               | Role                                                                                                  |
| --------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Contract        | `libs/contracts/src/briefing/briefing.schema.ts`   | `Briefing`, `BriefingNeedsYouItem`/`BriefingDidItem`/`BriefingWatchItem`/`BriefingEngagement` schemas |
| Contract (HTTP) | `libs/contracts/src/briefing/briefing.contract.ts` | ts-rest router — the pure `GET` and the persisting `POST /generate`                                   |
| Assembly (pure) | `apps/api/src/briefing/briefing-assembly.ts`       | `assembleBriefing` + `renderBriefingMarkdown` — zero I/O, snapshot-testable                           |
| Service         | `apps/api/src/briefing/briefing.service.ts`        | `BriefingService` — gathers state, calls assembly, persists the vault note, advances the cursor       |
| LLM seam        | `apps/api/src/briefing/claude-cli-briefer.ts`      | `ClaudeCliBriefer` — the optional butler-voice headline pass over the assembled sections              |
| Controller      | `apps/api/src/briefing/briefing.controller.ts`     | Implements `briefingContract` against `BriefingService`                                               |

## Endpoints (`/api/briefing`)

- `GET /briefing` — assemble and return the **current** briefing. A pure read with no
  side effects; the overview card calls this on every load.
- `POST /briefing/generate` — assemble, run the optional butler-voice pass, persist
  the prose to the vault, advance the cursor, and record a `briefing-generated`
  activity entry. This is the only mutating route; the morning automation drives the
  same path server-side on its own schedule.

## Flow

### Assembly (`BriefingService.assemble`)

A pure read with no persistence, used by both `GET /briefing` and as the first step
of `generate`:

1. Read the **since-cursor** — the `generatedAt` of the last briefing, persisted at
   `last-briefing.json` under the activity dir. A missing or garbage cursor falls
   back to the start of the current day (first boot, or a deleted cursor file).
2. Gather, in parallel: pending approvals, all pipeline runs and all goal runs
   (filtered down to parked / in-flight), in-flight channel items
   (`new`/`needs-draft`/`triaged` — an item awaiting reply research carries no
   approval, so it is something ZIBBY is watching, never a needs-you decision),
   activity entries since the cursor, queued/held/dead-lettered scheduled tasks,
   project names (for the engagement rollup), last-known CI statuses, the
   subsystem status rows (`SubsystemsService.list`) and the weekly usage window %
   (`LimitsService.snapshot`, both NS2 F3b), plus four vault
   reads — the 7-day trend (first line of each of the last 7 daily notes), learned
   automation patterns, the research digest headlines, the automation-gap
   suggestions, and the weekly app ideas. Every vault read is individually
   fail-soft — a missing or unreadable note degrades to an empty list, never throws;
   the subsystem/limits reads are equally `.catch`-guarded (a failed subsystem read
   drops the `subsystems` section, a failed limits read only drops Ledger's note).
3. Hand all of it to `assembleBriefing` (the pure function in
   `briefing-assembly.ts`), which builds five sections:
   - **`needsYou`** — pending approvals, parked pipeline/goal runs, dead-lettered
     tasks, and red-CI state lines, newest first. A currently-red CI is a _state_
     line (present while red, gone once green) rather than a one-time alert — the
     one-time notification is a separate monitor alert (`docs/api/monitors.md`).
   - **`didForYou`** — the last 10 activity entries of kinds that count as "ZIBBY
     did this for you" (`task-outcome`, `channel-reply`, `run-finished`,
     `pipeline-finished`, `approval-approved`).
   - **`watching`** — channel integrations with new items, pipeline runs paused on
     the usage limit, and in-flight/paused goal runs — things ZIBBY is doing or
     tracking, not decisions waiting on the operator.
   - **`engagements`** — one row per project with waiting tasks or attributable
     activity, rolling up `needsYou`/`didForYou`/`queued`/`held` counts (Phase 8.2);
     empty for a single-engagement operator, no rollup noise.
   - **`subsystems`** (optional, NS2 F3b) — one line per subsystem ("Forge: 2 PRs
     čekají · Puls: CI zelené · Ledger: 62 % týdenního okna"): state +
     tier2/tier3 counts straight from `SubsystemsService.list()`, plus a
     mandate-specific `note` for Ledger (weekly usage window %) and Puls (CI
     health from the gathered statuses). Strictly additive — old briefings omit
     the key, and a failed subsystem read assembles the briefing without it.
     Rendered as its own `## Subsystems` block in the vault note.
     A deterministic, English headline (`deterministicHeadline`) is always computed as
     the fallback — "Nothing needs you." when `needsYou` is empty, otherwise a count
     summary by kind.

### Generation (`BriefingService.generate`)

1. Call `assemble()`.
2. Run the optional butler-voice pass (`ClaudeCliBriefer.headline`) — see below.
   Failure or timeout is swallowed; the deterministic headline stands in.
3. Persist the briefing as Markdown (`renderBriefingMarkdown`) to a vault note named
   `briefing-<YYYY-MM-DD>` — **one note per day**; a second `generate` the same day
   updates it rather than colliding (`DuplicateNoteError` is caught and turned into an
   update).
4. Link the note from the day's daily vault note.
5. **Advance the cursor only after the note has persisted** — so a crash between
   assembly and persistence re-briefs idempotently on the next call rather than
   silently skipping a window.
6. Record a `briefing-generated` activity entry.

### The LLM-in-the-loop seam: `ClaudeCliBriefer`

This is the one piece of the briefing module that shells out to an LLM. It spawns
`claude -p <prompt> --output-format json --model haiku` (an 8-second timeout, killed
and treated as a failure past that) with a system prompt instructing it to return
**only** `{"headline": string}` — no prose, no code fences. The prompt it builds is
deliberately restricted to already-assembled, already-capped section data (`counts`,
the first 5 `needsYou`/`didForYou` items, `watching`) plus an optional operator
`focus` string (e.g. "keep it terse") that may steer tone but never facts — it is
never handed raw inbound channel text (Law 4: inbound content is data, never a
command). The result is validated against a strict single-key Zod schema; anything
that fails to parse or validate returns `null`, and the caller keeps the deterministic
headline. In tests (`process.env.VITEST` set) the CLI is never spawned at all — the
seam always resolves `null` and the deterministic headline is exercised directly.

### Scheduling

A `briefing` automation target dispatches `generate()` each morning (before the
operator's day starts); an automation's `prompt` field, if set, is threaded through
as the `focus` steering the butler voice. See `docs/api/automations.md` for the
scheduling mechanism itself.
