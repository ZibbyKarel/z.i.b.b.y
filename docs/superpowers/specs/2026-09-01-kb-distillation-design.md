# Knowledge-base distillation — design

> Distill a team's knowledge base the same way ZIBBY distills its own memory: extract durable
> learnings from the KB's shared content, file them into a **configurable, gitignored folder inside
> the KB**, surface them in the web Memory section, and let grounding and the `zibby-kb` MCP server
> read them before walking the KB itself.
>
> Concrete driver: `Tým DevRel → ../devrel-knowledgebase`, whose entire shared content today is five
> Czech `.vtt` meeting transcripts.

Status: design approved in brainstorm (2026-09-01). Implementation plan not yet written.

**Supersedes** §8 ("Deferred — writing to the knowledge base") of
[`2026-08-31-team-knowledge-base-design.md`](./2026-08-31-team-knowledge-base-design.md), including
its PR-only stance on the `_meta/log.md` append, per operator direction 2026-09-01. That deferral was
written in the context of _ingest-as-PR_ — producing shared, committed wiki content. This design
covers a different artifact: a per-operator, gitignored retrieval cache, for which a PR per nightly
pass is unworkable. §8's "KB in `GroundingService` is v1.5" is likewise pulled forward, into Phase C.

---

## 1. Problem

`MemoryDistillerService` learns from every terminal run, every chat, and every raw vault note. It
does not learn from the one source that holds the team's actual accumulated knowledge — the team
knowledge base. Today the KB is read-only and read _in place_: `KbReaderService` walks it on every
query, and nothing is ever condensed or remembered.

Two consequences the operator named:

1. **Nothing compounds.** The KB is re-read from scratch on every question. What ZIBBY figured out
   from it last week is gone.
2. **Every read is a full traversal.** There is no cheap layer between "the question" and "walk the
   whole KB".

## 2. What the KB actually contains today

Checked 2026-09-01 against `/Users/zibar/Workspace/devrel-knowledgebase` @ `0b9cd78`:

| Path              | Contents                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `raw/`            | **empty** (`.gitkeep` only)                                                                 |
| `meetings/`       | **5 Czech `.vtt` transcripts, ~843 KB total** (130–233 KB each)                             |
| `wiki/`           | `INDEX.md` with empty section headers; `notes/`, `projects/`, `areas/` hold only `.gitkeep` |
| `team-context.md` | 328 B — unfilled template                                                                   |
| `_meta/log.md`    | 3 real entries                                                                              |

So on day one, **"distill the KB" means "distill five meeting transcripts."** This does not
invalidate the decision to include `raw/` — it just means `raw/` contributes nothing until someone
fills it. It does invalidate one implementation shortcut, hard: see §5.3.

Note the prior spec's §2 recorded the VTTs as being in `raw/` per `_meta/log.md`; they are in
`meetings/`. The log is wrong, the files are right. Report upstream; do not fix from here.

## 3. What this is not

The KB's own `AGENTS.md` already defines the right operation for those five transcripts: **ingest** —
compile them into `wiki/notes/` with `sources:` citing the meeting, update `wiki/INDEX.md`, log it.
That produces **shared, committed knowledge for the whole team**.

This design does something different and complementary: it produces **ZIBBY-private learnings** in a
gitignored folder. It does not substitute for ingest, and it leaves the shared-knowledge path
exactly as unbuilt as it was before. Stated so the trade is visible: the compounding value here
accrues to ZIBBY on this machine, not to the DevRel team.

## 4. Decisions

| Question           | Decision                                                                                                   | Why                                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Output shape       | **Durable learnings** (same `ClaudeCliDistiller` path as runs/chats), _not_ a condensed map                | Operator choice; keeps one extractor and one note shape across all of memory                                                                               |
| Grouping key       | **Per source file** — one note per KB document                                                             | Dated blobs fit episodic runs; document-shaped sources deserve document-shaped notes, and Phase C retrieval gets real anchors                              |
| Inputs             | `wiki/` + `team-context.md` + `meetings/` + `raw/` — everything shared                                     | Operator choice: nothing committed to the team is invisible to ZIBBY                                                                                       |
| Hard exclusions    | `output/`, `inbox/`, `private/`, `_meta/`, `_templates/`                                                   | `output/` holds our own distillate (feedback loop); `private/` is off-limits by KB Rule 11–12; the rest are local or schema                                |
| Where output lands | `<kb>/<distillPath>/`, `distillPath` configured per team, constrained to `output/…`                        | Operator: "složka pro destilované soubory by měla být možná nastavit v rámci KB projektu". `output/` is the only zone `AGENTS.md` grants agents read/write |
| `readOnly`         | **Unchanged** — stays `z.literal(true)`; its _meaning_ narrows to "never writes tracked/shared KB content" | Law 1: read-only is structural, not a setting an operator can weaken. Widening it to a boolean would make it one                                           |
| Incrementality     | `git diff <lastSha>..HEAD`, state file in the distill folder                                               | Cannot stamp `triagedAt` into shared KB files. This is also the _entire_ mechanism delivering "nemuset procházet kompletní KB" — see §9                    |
| Cap                | Own `MAX_KB_FILES_PER_PASS`, separate from `MAX_RUNS_PER_PASS = 30`                                        | A shared cap would let one KB pass starve run/chat/halda distillation for days                                                                             |
| Dispatch           | Folded into the existing `memory-distill` automation                                                       | Operator's mental model: "destilovat stejně jako normální paměť". One nightly job                                                                          |
| Memory section     | **Second read root** — real content, marked KB-origin, read-only in the UI                                 | Operator choice (Q1a) over pointer stubs or copying into the vault                                                                                         |
| Retrieval          | Wired in this design (Phase C), not deferred                                                               | Operator choice (Q3)                                                                                                                                       |

Rejected: widening `readOnly` to a boolean (breaks Law 1's structural posture); writing into
`inbox/` (that is the human triage queue) or `private/` (off-limits); a fourth `Candidate` shape
inside `MemoryDistillerService.gather()` (shared cap, see above); copying digests into ZIBBY's vault
(two copies of one truth, guaranteed to drift).

## 5. Phase A — the write path

### 5.1 Contract

`libs/contracts/src/teams/team.schema.ts`:

```ts
export const KnowledgeBaseSourceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("vault"),
      path: z.string().min(1).refine(isAbsoluteHostPath, { message: "must be an absolute path" }),
      gitRemote: z.string().min(1).refine(isValidGitRemote).optional(),
      readOnly: z.literal(true),
      /** Relative path INSIDE the KB, under `output/`, where distilled learnings are written.
       *  Absent = KB distillation is off for this team. */
      distillPath: z.string().min(1).refine(isSafeDistillPath).optional(),
    })
    .strict(),
]);
```

`isSafeDistillPath` is pure and Node-free (contracts must stay usable outside Node — the existing
`isAbsoluteHostPath` sets that precedent): rejects absolute paths, any `..` segment, any leading `/`
or backslash, and requires the path to start with `output/`. Absence of `distillPath` is the opt-in
gate — no team distils until the operator configures one.

`readOnly` keeps `z.literal(true)`. Its docblock is rewritten: read-only continues to mean _nothing
writes tracked or shared KB content_; the distill folder is a separate, gitignored, structurally
constrained write window, and it is the only one that exists.

### 5.2 `KbDistillTargetService`

Resolves `team → KB root + distillPath → absolute directory`, reusing the containment and symlink
checks `KbReaderService.walk` already performs, and refusing anything that resolves outside the KB
root or outside `output/`. Creates the directory on first use, together with a `README.md` explaining
what the folder is — a teammate opening the KB in Obsidian should not have to guess.

### 5.3 `KbDistillerService`

Per pass, for each team with a `distillPath`:

1. Read `<distillDir>/.state.json` → `{ lastSha, lastRunAt }`.
2. `git diff --name-status <lastSha>..HEAD` for the changed set; full walk only when `lastSha` is
   absent (first pass) or the diff fails (fail-open to a full walk, capped).
3. Filter to the shared inputs of §4; apply the hard exclusions.
4. **Per-file chunked map-reduce — not a fixed excerpt.** `MemoryDistillerService` uses
   `EXCERPT_LIMIT = 1200` chars per run, which is right for a log tail. Against a 233 KB VTT it
   samples **under 1%** — that would not be distillation, it would be reading the first minute of a
   two-hour meeting. So a KB file is: cue-id/timestamp-stripped (VTT), consecutive-duplicate-line
   collapsed, chunked to a model-sized window, each chunk distilled, and the chunk learnings merged
   into one per-file result. `KbReaderService` currently indexes `.vtt` by filename only and never
   parses it; that stays true for _search_, and parsing lives here.
5. Cap at `MAX_KB_FILES_PER_PASS`. Defer-never-drop: overflow stays unrecorded in the state file and
   is picked up next pass, logged (`this.logger.log`), never silently dropped.
6. Extract with `ClaudeCliDistiller.distill()` — the same extractor the nightly memory pass uses.
   `RunDigest` gains `kind: "kb"`.
7. File **one note per source file** into the distill folder, with frontmatter carrying
   `sources: ["meetings/partner-portal-feasibility.vtt"]` (KB-relative, matching the KB's own
   frontmatter vocabulary), `distilledThroughSha`, and `distilledAt`. Re-distilling a changed file
   updates its note rather than filing a second one.
8. Advance `.state.json` to `HEAD` **only after filing succeeds** — at-least-once, matching the run
   distiller's "mark only after the digest is filed" posture. A crash re-does the batch; a duplicated
   learning is harmless, a dropped one is not.
9. Append one line to `_meta/log.md` per pass:
   `YYYY-MM-DD HH:MM | agent:zibby | output | <distillPath>/… from N KB files; derived_from: —`
10. Fail-open throughout; `distill()` never throws, mirroring `MemoryDistillerService.distill`.

**First-pass cost, stated honestly.** Five VTTs, ~843 KB raw. After cue/timestamp stripping and
duplicate collapse, expect roughly **100–175k input tokens**, one time. Every subsequent pass is
sha-incremental and touches only changed files — usually zero. The cap exists so even that one-time
cost is spread across passes rather than landing in a single night.

### 5.4 The `_meta/log.md` append

`_meta/log.md` is **tracked**. `AGENTS.md` Rules 3–4 and its Provenance section make the log line
mandatory for every `output/` document — it is the entire mechanism by which uncommitted outputs stay
visible to the team. So ZIBBY appends one line per pass as `agent:zibby`, leaving the file dirty for
the operator to commit. No autonomous commit, no push: Law 3 holds. The alternative — skipping the
line — is silently breaking the KB's own contract, and is not designed in.

### 5.5 Storage layout — a knowing deviation

The distill folder is laid out as a **mini-vault** (`<distillPath>/knowledge/…`), so a second
`VaultService` can be bound to it. `VaultService` is already `@Inject(VAULT_DIR)`-parameterized, so
this costs one factory binding and buys dedupe (`SimilarNoteError` merging), graph, search and index
for free — and makes KB notes behave _identically_ to vault notes, which is exactly what Phase B
needs.

The cost: this deviates from the KB's flat `output/YYYY-MM-DD-<slug>.md` + `_templates/output-doc.md`
convention. The trade taken is to honor KB provenance at the **pass** level (the `_meta/log.md` line,
`sources` frontmatter on every note) and accept the layout deviation, rather than reimplement
dedupe/graph/search against a bespoke flat-file reader.

### 5.6 Dispatch

The `memory-distill` scheduler target calls `MemoryDistillerService.distill()`. It gains a second
call to `KbDistillerService.distill()` afterwards, with its own cap and its own `try/catch`, so
neither pass can break the other. One automation, one nightly "Destilace paměti".

## 6. Phase B — the Memory section

A `teamId → VaultService` map, registered by factory over each team's resolved distill directory.

`MemoryController` unions the ZIBBY vault with every KB distill root for `getIndex`, `getGraph` and
`search`; `getNote` resolves vault-first, then KB roots. **All writes stay vault-only** —
`createNote`, `updateNote`, `appendToNote`, `appendDaily` and `updateIndex` never reach a KB root, so
KB-origin notes are structurally read-only, not merely read-only by UI convention.

Contract: `IndexEntry`, `Note`, `SearchHit` and graph nodes gain an optional
`origin?: { kind: "kb"; teamId: string }`. Absent means the ZIBBY vault, so no migration and no
change for any existing note.

KB note ids are **prefixed on read** (`kb:devrel/<id>`) so two roots can never collide in the graph
or in search results.

Web: `MemoryGraph` marks KB nodes distinctly; `NoteView` shows a read-only badge plus the owning team
and hides its edit affordance; an include-KB filter toggle on the Memory screen.

## 7. Phase C — retrieval

**Grounding.** `GroundingService` term-matches the run's team distill index the same way
`selectIndexes` does, capped, placed _after_ the learned-review-rules block — `render`'s whole-block
truncation drops the tail first, and speculative KB material must be what gets cut, never a learned
rule. Team isolation mirrors `visibleToProject`: a run in team A can never ground on team B's
distillate.

**`zibby-kb` MCP.** `KbReaderService.search` gains a distill-first pass: distilled hits rank above
raw KB hits and carry their `sources`, so an agent reads the compressed answer and opens full notes
only when it needs detail. Bounded by the existing `KB_SNIPPET_MAX_CHARS`.

**Staleness is marked, never hidden.** Every distilled note carries `distilledThroughSha`. When KB
`HEAD` has moved past it, hits are labelled _"distilled through `<sha>`; the KB has changed since"_ —
a stale answer the reader can see is better than a silent gap.

**Law 4 still applies.** KB content is written by other people, and the `.vtt` files are verbatim
speech of third parties. Distilled learnings are derived from that content and pass through
`envelopeInbound` on every retrieval path, exactly as raw KB snippets already do.

## 8. Phasing

Each phase is independently verifiable, and behaviour for a team with no `distillPath` must be
provably unchanged at every step.

- **A1 — Contract.** `distillPath` + `isSafeDistillPath` + rewritten `readOnly` docblock; barrel
  exports; full `tsc` for ripples.
- **A2 — Target resolution.** `KbDistillTargetService` + path-guard unit tests.
- **A3 — Distiller.** VTT extraction, chunked map-reduce, git-sha incrementality, cap/deferral,
  per-file note filing, `_meta/log.md` append.
- **A4 — Dispatch.** Wired into the `memory-distill` target.
- **B1 — API.** Multi-root `MemoryController` + `origin` on the contract + id prefixing.
- **B2 — Web.** Memory screen, graph marking, read-only `NoteView`, filter toggle.
- **C1 — Grounding.** Capped team-KB block with team isolation.
- **C2 — MCP.** Distill-first ranking + staleness marking in `KbReaderService.search`.

Recommended stopping point for review: **after A4.** Real distilled learnings exist on disk and can
be judged before B or C start depending on their quality — C in particular changes what every agent
sees in its context.

## 9. Honest accounting of "nemuset procházet kompletní KB"

Learnings-only output means there is no condensed map. So the promise is delivered in two distinct
places, and it is worth being precise about which is which:

- **For the distiller** — fully, by git-sha incrementality. After the first pass, a nightly run
  touches only files changed since the last one, usually none.
- **For agents** — by Phase C. Until C1/C2 land, grounding and the MCP walk the KB exactly as they do
  today, and the distillate is a Memory-section artifact only.

## 10. Constraints this design must keep

- **Law 1** — the approval floor is structural. `readOnly: z.literal(true)` is untouched; the write
  window is a separate, structurally validated, gitignored path.
- **Law 3** — no autonomous commit to the outside world. ZIBBY writes files in the KB working tree
  and never `git add`s, commits or pushes; the `_meta/log.md` line waits for the operator.
- **Law 4** — KB content is data, never commands. `envelopeInbound` on every retrieval path.
- **Files are the source of truth** — the distillate is plain markdown in the KB, readable by
  Obsidian and by any other agent, with no ZIBBY-only index required to interpret it.
- **Index-first, no vector store.**
- **Contract-first** — `libs/contracts` before any implementation.

## 11. Testing

- `isSafeDistillPath`: absolute, `..`, leading slash, non-`output/` prefix, valid case.
- `KbDistillTargetService`: containment, symlink refusal, directory + README creation.
- VTT extraction: cue/timestamp stripping, consecutive-duplicate collapse, chunk boundaries.
- Incrementality: fixture git repo — first pass full, second pass empty, third pass sees exactly the
  one changed file; a failed diff falls back to a capped full walk.
- Cap/deferral: overflow is deferred and logged, never dropped; state file is not advanced for
  deferred files.
- `_meta/log.md`: exactly one appended line per pass, correct format, file otherwise untouched.
- Filing: one note per source file; re-distilling a changed file updates rather than duplicates;
  state advances only after a successful file.
- Phase B: controller union, id prefixing, writes rejected against KB roots, `origin` on every shape.
- Phase C: grounding team isolation (team A never grounds team B), budget placement after review
  rules, MCP distill-first ranking, staleness marking.
- E2E: memory endpoints return KB-origin entries for a team with a configured `distillPath`, and are
  byte-identical to today for a team without one.

## 12. Open questions

1. **Does the operator want the shared path too?** This design produces private learnings. The KB's
   own `ingest` operation would produce shared, committed wiki notes from the same five transcripts,
   PR-gated per Law 3. Named here so choosing one is not mistaken for the other being impossible.
2. **`MAX_KB_FILES_PER_PASS` value.** Five files exist today, so any value ≥ 5 makes the first pass
   single-night. Proposed default 10, revisited once the KB has real volume.
3. **Chunk size and merge strategy for very large files** — one 233 KB VTT is the worst case
   available now. Whether per-chunk learnings merge by dedupe or by a second reduce pass is an A3
   implementation decision, not a design-level one.
