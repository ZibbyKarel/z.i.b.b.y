# Phase 82 — Subsystem live status: tier-mapped node states + seen-state

> Fills in the status stub from phase 80. Node states map to autonomy tiers (design doc table):
> `klid` (idle) · `bezi` (Tier 1 running) · `hlaseni` (Tier 2, report ready, dismissed by being
> seen) · `ceka` (Tier 3, needs explicit decision). "Report severity, not recency, drives
> ordering" — Tier 3 sorts first.

## 1 — Aggregation (`SubsystemsService`)

The service assembles state by querying EXISTING services with the `ownerSubsystem` filter —
it duplicates no logic (design doc: "a thin aggregation layer"). Per subsystem:

- **Owned pipelines/chains**: ids where `ownerSubsystem === subsystem.id` (from the phase-81
  tag, via the existing pipelines/chains storage services).
- **`bezi`**: any currently-running run whose pipeline/chain is owned. Use the existing unified
  task-runs store (`/api/tasks/runs` backend service) — resolve run → pipeline id → owner.
- **`ceka` + `tier3Count`**: pending approvals attributable to an owned pipeline's run. Trace
  the existing approvals service; attribution goes approval → run → pipeline → owner. If an
  approval can't be attributed to any subsystem, it simply doesn't count here (the global
  approvals surface still shows it — no data loss, this is a lens).
- **`hlaseni` + `tier2Count`**: runs that COMPLETED (terminal success) after the subsystem's
  `lastSeenAt` (below). Failed runs that parked → they surface as approvals/Tier 3 when a
  decision exists, else they count as tier2 "worth a look" reports too (completed-or-errored
  since lastSeenAt).
- Precedence when several apply: `ceka` > `bezi` > `hlaseni` > `klid` (waiting-on-you must
  never be masked by ambient activity). Counts are independent of the headline state.

## 2 — Seen-state (Tier 2 acknowledgment = "seen")

- File-backed, tiny: `.zibby/data/subsystem-seen.json` → `{ [subsystemId]: IsoDateTime }`.
  Missing file / missing key = epoch (everything unseen). Written atomically like other
  `.zibby/data` stores (follow `gate-rules.storage.service.ts` idiom).
- Contract addition: `markSubsystemSeen: POST /subsystems/:id/seen → 200: SubsystemWithStatusSchema`
  (returns the refreshed entry). The web calls this when the operator opens the subsystem's
  drawer (phase 84 wires it); Tier 3 items are NOT cleared by this — they resolve only through
  the existing approvals flow (different acknowledgment models, per the design doc).

## 3 — Severity ordering

`getSubsystems` returns entries sorted: any `ceka` first (by tier3Count desc), then `hlaseni`
(tier2Count desc), then `bezi`, then `klid`; registry order as the stable tiebreak. The web
strip itself keeps FIXED positions (nodes never move — design doc), so this ordering is for
lists/briefings; document that distinction in the service comment.

## Tests

- Attribution: run on owned pipeline running → `bezi`; pending attributable approval → `ceka`
  even while another run is active (precedence); completion after lastSeenAt → `hlaseni` with
  count; `markSeen` resets tier2Count to 0 and state falls back to `klid`/`bezi`.
- Unattributable approvals/runs are excluded without error.
- Ordering: mixed fixture sorts tier3-first, registry-order tiebreak.
- Seen store: missing file tolerated; write is atomic; unknown id → 404.

## Verification (paste real output)

- `npx tsc -p` contracts + api — clean; `npx eslint <touched>` — clean.
- `npx vitest run libs/contracts apps/api/src/subsystems` — green.

## Constraints

- READ-ONLY over other domains' services — inject and query them; never re-implement run/
  approval semantics, never reach into their storage files directly.
- Status stays polled STATE (poll-for-state DNA); no SSE here (phase 89 handles live particles).
- Keep `hlaseni` cheap: no new "report" entity — it's derived (runs since lastSeenAt), so there
  is nothing new to migrate later.
