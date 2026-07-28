# Self-Knowledge (drift-checked machine self-description)

**Fáze 1, extended Fáze 10** (`docs/plans/phase-06.md`,
`docs/plans/phase-10-graphify-self-knowledge.md`). ZIBBY composes a
machine-generated Markdown snapshot of its own agents, pipelines, gate rules,
channels and (Fáze 10) codebase shape, persists it as one vault note, and can
detect when that note has **drifted** from a fresh compose — the underlying
catalog changed since the note was last written/committed. This is the engine
behind the `check:self-knowledge` pre-commit/CI gate.

## Pieces

| Piece      | File                                                           | Role                                                                      |
| ---------- | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Contract   | `libs/contracts/src/self-knowledge/self-knowledge.schema.ts`   | `SelfKnowledgeSchema`, `SelfKnowledgeSectionsSchema`                      |
| Contract   | `libs/contracts/src/self-knowledge/self-knowledge.contract.ts` | `selfKnowledgeContract` — one GET, no mutation route                      |
| Service    | `apps/api/src/self-knowledge/self-knowledge.service.ts`        | `SelfKnowledgeService` — gathers inputs, composes, drift-checks, writes   |
| Composer   | `apps/api/src/self-knowledge/self-knowledge.composer.ts`       | pure: `composeSelfKnowledge`, `mergeAutoBlocks`, `computeDrift`           |
| Parser     | `apps/api/src/self-knowledge/graph-report.parser.ts`           | pure: parses graphify's `GRAPH_REPORT.md` into a digest                   |
| Controller | `apps/api/src/self-knowledge/self-knowledge.controller.ts`     | implements `selfKnowledgeContract`                                        |
| CLI logic  | `apps/api/src/self-knowledge/generate-cli.ts`                  | `runSelfKnowledgeCli` — boots `AppModule` headless, `--check` vs generate |
| CLI entry  | `tools/self-knowledge/generate.ts`                             | thin wrapper (no bare-specifier imports — see Gotchas)                    |
| Module     | `apps/api/src/self-knowledge/self-knowledge.module.ts`         | imports Agents/Pipelines/GateRules/Gates/Memory                           |

## What it tracks

The note is Markdown with **seven machine-owned "AUTO" blocks**, delimited by
HTML comments (`<!-- AUTO:<KEY>:START -->` / `…:END`). Everything outside them
is operator-owned and untouched by a merge. Block order = render order:

1. **META** — generation timestamp only. Deliberately **excluded** from drift
   comparison (it differs every run by design, not a meaningful signal).
2. **AGENTS** — every agent, sorted by id: `name (\`id\`) — desc`.
3. **PIPELINES** — every pipeline, sorted by id, with its phase count.
4. **SUBSYSTEMS** — static subsystem identity only (name + mandate) from
   `@zibby/contracts`' `SUBSYSTEMS` — **never** live state/tier2Count/tier3Count
   (phase-105 decision 3: baking live status in would make drift read "changed"
   almost continuously, defeating the signal).
5. **GATES** — the locked system floor (`POLICY.md`, via `PolicyStorageService.floor()`)
   plus the global gate-rule catalog, each rule rendered as `match → decision`.
6. **CHANNELS** — the set of channel adapter _kinds_ ZIBBY knows how to speak
   (`IntegrationKindSchema.options` — reused rather than duplicated, since the
   live `AdapterRegistry` is an unenumerable `switch`, not a list — see the
   service's doc comment).
7. **CODEBASE-SHAPE** (Fáze 10) — a digest (top 10 god nodes by edge count, top
   10 communities by size) of graphify's `graphify-out/GRAPH_REPORT.md`, parsed
   by `graph-report.parser.ts`. `graphify-out/` is entirely gitignored and
   machine-local; a missing/unreadable report renders a one-line
   "run `/graphify`" hint instead of failing.

All entity lists sort **ascending by id using code-unit comparison**
(`ascendingById`, a plain `<`/`>`, not `localeCompare`) — deliberately, because
`localeCompare`'s locale-default collation reordered ids differently between
macOS and CI's Linux locale, causing phantom drift.

## Drift detection

`SelfKnowledgeService.compose()` runs the composer's raw markdown through the
project's own Prettier config (`formatMarkdown`) before comparing or persisting
it — `lint-staged`'s pre-commit `prettier --write` reformats the committed note
like any other tracked Markdown file (blank lines around headings/HTML comments,
escaped bare `*`), so comparing the composer's unformatted output against that
reformatted-on-disk note reported phantom drift on every commit, same class of
bug as the `localeCompare` one above. Falls back to the raw markdown if config
resolution or formatting fails — this step never blocks compose.

`computeDrift(existing, generated)` (pure, in the composer) compares every
AUTO block **except META** between the vault note's current body and a fresh
compose: a byte-for-byte content mismatch (after `.trim()`), or a block
missing from either side, counts as drift. `SelfKnowledgeService.compose()`
treats a wholly-missing note as `drift: true`.

`mergeAutoBlocks(existing, generated)` writes only the AUTO blocks into
`existing`'s body, leaving everything else — operator prose, note order —
untouched; a block present in `generated` but missing from `existing` (a
hand-created note, or a new block from a later phase) is appended at the end.

## The CLI (`--check` vs generate mode)

Run via root `package.json` scripts:

```
pnpm self-knowledge:generate   # compose fresh, write-or-merge into the vault note
pnpm check:self-knowledge      # --check: compose fresh, compare, DON'T write
```

Both invoke `tools/self-knowledge/generate.ts` through
`pnpm --filter @zibby/api exec ts-node -P tsconfig.json ../../tools/self-knowledge/generate.ts [--check]`.

`runSelfKnowledgeCli` (`apps/api/src/self-knowledge/generate-cli.ts`) boots the
**same `AppModule`** the server does via `NestFactory.createApplicationContext`
(no HTTP listener, `logger: false`), so it reads the exact same
agents/pipelines/gate-rules/policy/vault the running API would — no separate
code path to drift from the server itself.

- **Default mode** — `service.write()`: compose, create-or-merge the vault
  note, print its path.
- **`--check` mode** — `service.check()`: compose, compare, **never writes**.
  On drift: prints a fix instruction and sets `process.exitCode = 1`. This is
  what `check:self-knowledge` and the CI step both invoke — a stale committed
  note fails the gate.

`pinRelativeDataDir()` runs before `NestFactory` instantiates the `*_DIR`
providers: it resolves a relative `ZIBBY_DATA_DIR` against pnpm's `INIT_CWD`
(the repo root for a root script) rather than `process.cwd()` (which the
`pnpm --filter @zibby/api exec` invocation pins to `apps/api`) — otherwise a
relative data dir would silently resolve one level too deep.

## The vault note

Fixed id/tier/title: `SELF_KNOWLEDGE_NOTE_ID = "self-knowledge"`, tier
`"knowledge"`, title `"Self-Knowledge"` — one durable note, created via
`VaultService.createNote`/`updateNote` (see `docs/api/memory.md`).

## Endpoint (`/api/self-knowledge`)

```
GET /self-knowledge   → { markdown, generatedAt, drift, sections }
```

**Read-only by design** — writing/regenerating the note is a CLI concern, not
an HTTP mutation (`selfKnowledgeContract`'s doc comment: "there is
intentionally no POST here"). `sections` is a cheap at-a-glance summary
(counts per category) for a UI badge without parsing the markdown.

## Gotchas

- `tools/self-knowledge/generate.ts` deliberately holds **no** `@nestjs/*` (or
  other bare-specifier) imports of its own — it lives outside `apps/api`, so it
  has no `node_modules` ancestor carrying those packages. Only
  `apps/api/src/self-knowledge/generate-cli.ts` (inside `apps/api`) can import
  Nest; the CLI wrapper uses a plain relative import into that file so it
  resolves regardless of which directory's `node_modules` is in scope.
- CI runs `check:self-knowledge` with `ZIBBY_DATA_DIR=apps/api/data-test` (the
  fixture catalog); running it locally with the live data dir can pass even
  when the committed fixture note has drifted from the fixture catalog —
  `docs/plans/phase-110-ci-green-revealed-debt.md` documents exactly this trap.
- `graph-report.parser.ts` is tolerant by construction: graphify's report
  format is owned by an external tool, so any unrecognized section or
  unmatched line is silently skipped, never thrown — worst case an empty
  digest, never a CLI crash.
