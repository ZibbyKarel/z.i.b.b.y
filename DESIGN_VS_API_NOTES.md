# Design ↔ API differences — notes for Karel

## How to run the demo

```bash
npm run seed        # writes mock skills/agents/pipelines/automations/vault/approvals/runs
npm run api:dev     # start the API AFTER seeding (it reconciles seeded runs on boot)
npm run web:dev     # then the web app
```

The seed spawns one long-lived token-free emitter so a genuine `running` run shows;
re-run `npm run seed` (then restart the API) to refresh timestamps — `done`/`error` runs
age out of the Runs list after 30 min by design.

**Port/CORS gotcha:** the API's CORS default only allows `http://localhost:3000`. If Next
picks another port (e.g. 3001 because 3000 is taken), API calls are blocked and screens look
empty. Either free port 3000, or start the API with
`CORS_ORIGIN="http://localhost:3000,http://localhost:3001" npm run api:dev`.

---


While implementing the Claude Design handoff (`ZIBBY velín`) into the app, I kept the
contract and the API **untouched** (as requested). Where the design needs something the
contract doesn't model, I enriched/derived it on the **frontend** and made it degrade
gracefully to the plain contract shape. The places where the design and the finalized
backend contracts genuinely diverge are listed below — these are decisions worth a look.

## Approvals (flagship) — richest divergence

The design's approval is a **rich, structured object**; the contract `Approval` is **flat**:

| Design (`data-extra.jsx` `APPROVAL_QUEUE`) | Contract `ApprovalSchema` |
|---|---|
| `risk` = **semantic type** (`platba` / `mazani` / `push` / `odeslani`) | `risk` = **severity** (`low` / `medium` / `high`) only |
| separate `severity` meter (low/med/high) | — (the single `risk` field doubles as severity) |
| `actor`, `actorKind`, `summary`, `consequence`, `via`, `requested`, `glyph` | `skill`, `action`, `detail`, `runId`, `kind`, `requestedAt` |
| structured **`preview`** (cart items / git diff hunks / shell command + delete targets / message body) | nothing — `detail` is a single free string |

**What I did (no contract change):** I pack the extra fields (semantic risk type + preview +
actor/consequence/…) as **JSON inside the free-string `detail`**, and the contract `risk`
field carries the **severity**. The frontend parses `detail`; if it's *not* JSON (a real
backend sending a plain string) it falls back to rendering `detail` as plain text, so the
screen still works against the real API. `kind` maps `pipeline → "pipeline-stage"`.

**If you want this first-class:** widen `ApprovalSchema` with an optional `riskType` enum and
an optional discriminated `preview` union. Phase 3.5's "`PendingApproval` with `steps[]`"
(mentioned in the schema comment) is the natural home.

## Runs & activity

- The run contract (`AgentRun` / `SkillRun`) has **no `cost`, `elapsed`, `name`, `glyph`,
  or unified `kind` label** that the design's run cards show. I **derive** `elapsed` from
  `startedAt`, take `name` from `agentId`/`skillId`, pick a `glyph` client-side, and **omit
  cost** (there's no token/$ accounting in the contract; the design's `$0.42` etc. is mocked).
- There is **no unified cross-kind runs list** endpoint. The Runs screen calls
  `skillRuns.list` + `agentRuns.list` (+ `pipelineRuns.list`) and **merges client-side**.
- **30-min retention + restart reconcile** (`runner-core.ts`): `list()` drops `done`/`error`
  runs older than 30 min, and on restart any `running` run with no live process is relabelled
  `interrupted`. So **static seed sidecars reliably show only `awaiting-approval` and
  `interrupted`**; `done`/`error` only show if started < 30 min ago, and a true `running`
  needs a live process. The seed script (`apps/api/scripts/seed.mjs`) handles this by stamping
  fresh timestamps and spawning one live token-free demo run.
- Pipeline runs are **not seeded** (the `PipelineRun` aggregate + per-stage sandboxes are
  heavy to fake); they appear in the feed once you actually start a pipeline.

## Skills

- Contract `Skill` is `{ id, name, glyph, desc, requires_approval, risk, instructions }` —
  it has **no `category`, `tools`, or `model`** field. The design groups skills by category
  and shows tools/model on the card. Extra frontmatter is **stripped by Zod on read**, so a
  skill's category can't round-trip. Skills are therefore presented **ungrouped** (agents,
  which *do* have `category`, are grouped). If you want grouped skills, add `category`/`tools`
  to `SkillSchema`.
- Skill definitions also don't store the design's `runs` count, `lastRun`, `state`, `pinned`
  — those are runtime/UI-only in the design and are not persisted.

## Pipelines

- Design phases reference the agent by **display name** (`agent: 'Architekt'`); the contract
  `PipelinePhaseSchema.agent` is an **agent id** (`architect`). Seed maps name → id.
- Design phases have **no `id`**; the contract requires a unique phase `id` (loop targets
  reference it). Seed assigns phase ids.
- The tester loop's `then: 'park_for_review'` (design) has **no equivalent** in the contract
  (`PhaseLoop.then` must be an existing phase id or the literal `"fail"`). Seed maps it to
  `"fail"`. The "park for review" idea lives at the **pipeline-run** level instead
  (`PipelineState = "parked"`), not on the phase loop.

## Automations

- Design triggers are **human-readable** (`'Po–Pá · 08:00'`); the contract needs a real cron
  `expr`. Seed converts (`'0 8 * * 1-5'`, etc.).
- The contract `Automation` has **no `requiresApproval`, `gate`, `actionSafeAfter`, `desc`,
  or `nextRun`** — the design shows all of these. They're dropped on seed. (Approval gating is
  meant to live in the **gates engine** + the approval queue, not on the automation record.)

## Gates / approval rules (chat 6 — the newest design)

- The gates contract is **per-agent**: `GET/PUT /agents/:id/gates` (inherited locked floor +
  the agent's own rules) and a system `GET /gates/policy` + dry-run `POST /gates/evaluate`.
  There's **no standalone "rules" resource** — so the approval-rules UI is built as an
  **agent-scoped editor**, matching the design's `ZIBBY Pravidla schvalování.html` (which was
  itself the agent editor's left column, not an integrated screen).
- **Open inconsistency in the design itself:** the gate-rules matcher still offers a
  `Kontext (home/work)` condition type, even though the home/work context was removed
  everywhere else in chat 3. The contract *does* keep a `context` match condition, so it's
  harmless, but the UI copy should probably drop the home/work framing.

## Misc

- Integrations have **no contract** at all — they remain a **client-only** store
  (`apps/web/state/store.tsx`). Seeded there, not in `apps/api/data`. Their `risky[]` /
  `usedBy[]` (which the design says "feed gating") are presentation-only here.
- The whole `apps/api/data/` dir is **gitignored**, so seed data can't be committed — hence
  the seed **script** (`npm run seed`). Run it (with the API stopped, then start the API) to
  populate every screen.
