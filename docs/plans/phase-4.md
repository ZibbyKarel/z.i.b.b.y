Phase 4 — Second brain: memory lifecycle

▎ First implementation step: save this plan verbatim as docs/plans/phase-4.md
▎ and commit it ("phase 4 plan"), matching the phase-1/2/3 workflow.

Context

ROADMAP.md Phase 4 (lines 236–277): every run grounds itself at start and leaves a
durable trace at end; memory compounds instead of being a read-only graph viewer.
Three sub-items: 4.1 vault write API, 4.2 run lifecycle ground → work → record,
4.3 memory UI write surfaces. Exit criterion: "what did you do yesterday and what
do you know about project X" is answered from vault files written by runs.

Phases 1–3 are implemented (git log: b3baaa5 "phase 3 implemented"): runs spawn in
worktrees with cwd = project checkout, the delivery pipeline ends at the pr-autor
gate, and outcome write-back (subscribe + bootstrap sweep) is an established pattern.
Phase 4 only depends on Phase 1, per the roadmap sequencing — it is the next numbered
phase and unblocked.

Verified ground truth that shapes the design:

- VaultService (apps/api/src/memory/vault.service.ts) is read-only plus one append:
  index() :51–57 picks MOC entry points by /(^|[-_ ])(index|moc)$/i on the note id;
  note(id) :59–74 (backlinks, NoteNotFoundError); graph() :76–87; search(q) :89–105;
  appendDaily(text) :107–117 — fs.appendFile, NOT atomic, nulls the cache. scan()
  :120–149 parses gray-matter; ids are basenames (:133), title from frontmatter;
  tierOf :151–156 derives tier from the top path segment (root → "memory");
  extractLinks :158–165 handles [[target|alias]] / [[target#anchor]]. A 5 s scan
  cache (:121, CACHE_MS :41) means every writer MUST null this.cache.
- Vault dir: resolveVaultDir() (memory.module.ts:7–9) =
  process.env.VAULT_DIR ?? dataDir("vault"). The dev vault apps/api/data/vault is
  empty and — despite the module comment ":6 (gitignored)" — NOT gitignored
  (.gitignore only covers data/\*\*/runs, data/approvals, data/tasks). Committed seed
  files are the house pattern (agents/, pipelines/, POLICY.md).
- Contract (libs/contracts/src/memory/): GET index / note/:id / graph / search +
  POST /memory/daily. NoteSchema documents ids as "basename, unique across the
  vault" (memory.schema.ts:8–9) — write paths must enforce vault-unique ids, not
  per-dir. MemoryTierSchema = ["memory", "daily", "knowledge"].
- Reusable: writeFileAtomic (shared/file-storage/file-utils.ts:38–47) and
  resolveSafeFile (:55–65). resolveSafeFile's containment check is
  path.dirname(file) === dir — flat-dir only. Each vault tier is ONE flat dir
  (root, daily/, knowledge/), so resolving against the tier dir (never the vault
  root) makes the existing helper sufficient — no new helper. ↓
- Grounding seam: OPERATING_CONTRACT (claude-run-command.service.ts:81–99) is ↓
  prepended via withOperatingContract :113–115 and lands in
  --append-system-prompt (:204–205) — the only system-prompt seam; runs spawn ↓
  with cwd = worktree/checkout, so context-from-cwd cannot carry vault state.
  ClaudeRunOptions :14–35 has no grounding input. Flag-matrix unit tests ↓
  (claude-run-command.service.test.ts) pin arg construction.
- matchedTerms: TaskRouting carries matchedTerms: string[] (task.schema.ts:86–96), ↓
  computed in keyword-scorer.ts:38–79 (tokenize :6–8 is the canonical tokenizer).
  task-scheduler.service.ts dispatch() :189–204 passes target.id + taskId into ↓
  the runners' .start(...). UI-started runs never pass through the classifier.
- Run completion: runner-core.ts finalize() :724–757 emits terminal status while the ↓
  process is up; init() :194–254 rebuilds from disk WITHOUT emitting status for
  already-terminal runs — a subscriber alone misses runs that ended across a ↓
  restart. TaskSchedulerService is the recorder's blueprint: onModuleInit subscribes
  both runners' onRunStatus (:68–77; agent-runner.service.ts:380–382, ↓
  pipeline-runner.service.ts:849+), onApplicationBootstrap sweeps (:97–99,
  :206–227). Both runners expose list(). ↓
- Pipeline: PipelineRunSchema (pipeline-run.schema.ts:64–96) persists taskId,
  projectPath, workspace — an optional field rides the same rails (writeAggregate / ↓
  readAggregate :831–842). buildStageCommand (pipeline-runner.service.ts:760–821)
  builds claude stages at :784–814; demo mode runs demo-stage.mjs (:815–820). ↓
  readArtifact (:423–451) serves the PIPELINE_RUN_ARTIFACTS allowlist
  (pipelines.contract.ts:21) across run root + phase sandboxes, traversal-guarded — ↓
  a free, honest lookup for learned.md. projectForRun (:259–269) re-resolves a
  project from persisted projectPath. ↓
- Delivery pipeline (apps/api/data/pipelines/delivery.pipeline.md): architekt →
  koder → review(loop) → verify(loop) → dokumentator → pr-autor. dokumentator ↓
  (data/agents/dokumentator.md, tools Read/Write/Grep/Glob) writes docs.md — the
  natural author of learned.md (pr-autor is the gated PR phase, wrong home for ↓
  reflection).
- Module graph: AgentsModule imports ClaudeRunModule + ProjectsModule; ↓
  PipelinesModule imports AgentsModule + ClaudeRunModule; TasksModule imports both
  runners; MemoryModule imports nothing and is exported. Once Agents/Pipelines ↓
  import MemoryModule (grounding), the recorder CANNOT live in MemoryModule without
  a Nest DI cycle. ↓
- Web: features/memory has Screen.tsx (graph + note viewer only), queries
  useMemoryGraphQuery (["memory","graph"]) / useNoteQuery (["memory","note",id], ↓
  enabled-gated), NO mutations folder, search unwired. Mutation pattern:
  features/agents/mutations/useCreateAgentMutation.ts (apiClient useMutation + ↓
  invalidateQueries on getXxxQueryKey). CRUD modal pattern: AgentDetailModal.tsx.
  DS: MarkdownEditor (value/onChange/label/hint/placeholder/ariaLabel, ↓
  MarkdownEditorTestId — body-only, frontmatter never typed), Dialog (sm..2xl),
  SearchBar, Chip; @zibby/forms has FormMarkdownEditor. i18n cs/en + parity test. ↓
- e2e: memory.e2e.test.ts builds a temp vault via VAULT_DIR (graph/note/search/404/
  appendDaily) — no vault unit tests exist. Playwright global-setup.ts:70–75 seeds ↓
  the e2e vault (MEMORY/rohlik/zibby); memory-graph.spec.ts asserts memory-graph +
  memory-node-<id> testids with dispatchEvent("click"). fake-claude.mjs / ↓
  demo-stage.mjs are env-knob driven, knobs default off — shared by every suite.
  Recorder logic is mode-agnostic (terminal status fires in demo mode too). ↓

Decisions taken (defaults chosen, flag if you disagree) ↓

1.  Write addressing is {tier, id} — the client NEVER sends paths. NOTE*ID ↓
    regex ^[a-zA-Z0-9]a-zA-Z0-9.* -]{0,119}$ (no separators; covers existing ids
    MEMORY, 2026-06-12). Resolution = tier → dir map (memory → vault root, ↓
    daily → daily/, knowledge → knowledge/) then the EXISTING
    resolveSafeFile(tierDir, id, ".md", NOTE_ID). createNote rejects an id existing ↓
    in ANY tier (ids are vault-unique → 409); tier and id immutable on update (no
    move op in Phase 4). ↓
2.  updateIndex is the minimal idempotent op: "ensure a wikilink line for
    target exists in MOC id" — POST /memory/index/:id/links { target, label? }. ↓
    Missing MOC → auto-created in knowledge/ (title from id); a list line already
    containing [[target]] → replaced in place (label refresh); else ↓

- [[target]] — label appended. Auto-create is load-bearing: the recorder links
  learned notes from project MOCs that don't exist yet. No general "edit MOC". ↓

3.  One note per project doubles as project memory note AND project MOC:
    knowledge/<projectId>.md. Grounding reads it; the recorder links into it. ↓
    (Contestable — two notes would separate facts from links; one keeps the graph
    connected and grounding cheap; the operator can split later by hand.) ↓
4.  Grounding block sits between the operating contract and the agent body:
    OPERATING_CONTRACT + grounding + instructions. ClaudeRunCommandService gains ↓
    only grounding?: string on ClaudeRunOptions and stays vault-agnostic; a new
    GroundingService (MemoryModule) composes the text; the CALLERS (agent runner, ↓
    pipeline stage builder) thread it. Compose is fail-open: any error or empty
    vault → "" → no block (a memory hiccup never blocks a run). ↓
5.  Index selection: terms = classifier matchedTerms when the run came through
    dispatch, else tokenize(task) (export tokenize from keyword-scorer.ts — same ↓
    rule, no drift). A MOC (vault.index() entry) is selected when its title/id
    tokens intersect the terms; top 2 by overlap count. North Star = fixed note id ↓
    north-star (seeded). Budget: 2 000 chars per note, 8 000 per block (truncate
    with a marker line) — chars not tokens, conservative because the block rides ↓
    argv (--append-system-prompt).
6.  matchedTerms threading: agentRunner.start(..., matchedTerms?); ↓
    pipelineRunner.start(pipelineId, taskId?, projectRef?, matchedTerms?) persists
    matchedTerms?: string[] on PipelineRunSchema so parked/resumed runs re-ground ↓
    identically per stage.
7.  Recorder = new RunRecorderService in its own module ↓
    (apps/api/src/memory/run-recorder.module.ts) importing Memory + Agents +
    Pipelines + Projects — NOT inside MemoryModule (decision 4 makes ↓
    Agents/Pipelines → Memory an edge; the recorder needs the reverse edge, so it
    lives a level up, exactly like TasksModule does for outcomes). Subscribe ↓
    onModuleInit, sweep onApplicationBootstrap (init() does not re-emit terminal
    statuses — the sweep is load-bearing). ↓
8.  Recorder idempotency: at-most-once via marker file
    <run.cwd>/memory-recorded.json ({ recordedAt }) written BEFORE the vault ↓
    writes — a crash inside the window loses one daily line but can never duplicate
    (daily append has no dedup). (Contestable: at-least-once + content-dedup is the ↓
    alternative; rejected as more machinery for a line of episodic log.)
9.  learned.md: the dokumentator emits it (instructions change only — no ↓
    pipeline schema change, no new phase); "learned.md" joins
    PIPELINE_RUN_ARTIFACTS so the recorder fetches it via the existing readArtifact ↓
    — and the web artifact endpoint serves it for free. On pipeline done the
    recorder files it as knowledge/learned-<pipelineRunId>.md (frontmatter: title, ↓
    source run, project) and updateIndex-links it from the project MOC; the daily
    line carries [[learned-…]] + [[<projectId>]] wikilinks. Failed runs get the ↓
    daily line only.
10. Seed the dev vault with committed files (the agents/pipelines pattern): ↓
    apps/api/data/vault/north-star.md (operator mission, memory tier) +
    apps/api/data/vault/knowledge/zibby-index.md (starter MOC linking ↓
    north-star). Add apps/api/data/vault/daily/ to .gitignore (episodic writes
    must not dirty the tree); knowledge/ stays visible — same posture as ↓
    data/agents. Fix the stale "(gitignored)" comment in memory.module.ts:6. Real
    operation points VAULT_DIR at the Obsidian vault (README paragraph, 4.1). ↓
11. Web scope stays the roadmap's: ONE NoteEditorDialog for create+edit (DS
    MarkdownEditor for the body — frontmatter assembled by the API from structured ↓
    fields), DS SearchBar wired to GET /memory/search, tier filter as a Chip row
    filtering graph + search client-side, daily timeline derived from graph nodes ↓
    with tier "daily" (ids are dates — sort desc; NO new endpoint). No delete
    surface (roadmap doesn't ask; deletes are gated by law). ↓

Implementation order: 4.1 → 4.2 → 4.3. (4.2's recorder needs ↓
createNote/updateIndex; 4.3 needs the write endpoints; keeping vault writes first
means every later test asserts through real reads.) ↓

--- ↓
4.1 Vault write API  — ✅ DONE (commit "phase 4.1: vault write API")
↓
Contracts (libs/contracts/src/memory/memory.schema.ts + memory.contract.ts):
↓

- NoteIdSchema (decision 1 regex, documented) — reused by path params and bodies.
  CreateNoteSchema { id, tier, title?, body, frontmatter? }; UpdateNoteSchema { title?, body?, frontmatter? } (partial; merg↓semantics); AppendNoteSchema { text: min(1) }; UpdateIndexLinkSchema { target: NoteId, label?: string }.
- Endpoints: createNote POST /memory/notes → 201 NoteSchema / 409 (duplicate) / ↓
  422 (bad id); updateNote PATCH /memory/notes/:id → 200 / 404; appendToNote
  POST /memory/notes/:id/append → 200 / 404; updateIndex POST ↓
  /memory/index/:id/links → 200 NoteSchema (the MOC, re-read) / 422. Extend
  memory.contract.test.ts. ↓

VaultService (apps/api/src/memory/vault.service.ts): ↓

- tierDir(tier) map; resolveNoteFile(tier, id) = resolveSafeFile(tierDir, id, ↓
  ".md", NOTE_ID) → null ⇒ throw new InvalidNoteIdError(id) (→ 422).
- createNote({id, tier, title, body, frontmatter}): scan() dup-check across ALL ↓
  tiers (DuplicateNoteError → 409); matter.stringify(body, {title, …frontmatter}); mkdir tier dir; writeFileAtomic; this.cache = null; return ↓
  this.note(id).
- updateNote(id, patch): locate via scan() (NoteNotFoundError → 404); re-parse ↓
  the RAW file, merge frontmatter (patch wins per key, unknown operator keys
  PRESERVED), title into frontmatter.title, body replaced when given; ↓
  matter.stringify + writeFileAtomic; cache null; return note(id).
- appendToNote(id, text): read-modify-write through gray-matter (content + ↓
  \n\n${text}\n) + writeFileAtomic — atomic, unlike appendDaily (which stays
  as-is: hot episodic path, single-line). ↓
- updateIndex(mocId, target, label?) per decision 2: find note id === mocId;
  absent → createNote in knowledge/ (title = humanized mocId); replace-or-append ↓
  the [[target]] line (escape target for the regex); atomic write; cache null;
  return the MOC note. ↓

Controller (memory.controller.ts): map InvalidNoteIdError → 422, ↓
DuplicateNoteError → 409, NoteNotFoundError → 404 (existing pattern :16–25).
↓
Config/docs: README gains an "Obsidian vault" paragraph next to the env table:
point VAULT_DIR at the real vault; apps/api/data/vault is the dev default with ↓
committed seeds. Seed files + .gitignore line per decision 10; fix
memory.module.ts:6 comment. ↓

Tests: ↓

- NEW apps/api/src/memory/vault.service.test.ts (temp dir, no Nest): create → ↓
  re-read round-trip (frontmatter, tier, links extracted); duplicate id across
  tiers → DuplicateNoteError; traversal corpus (../x, a/b, .., .hidden, ↓
  empty, 121 chars) → InvalidNoteIdError; update merges frontmatter and preserves
  unknown keys; append keeps frontmatter intact; no .tmp leftovers after write; ↓
  updateIndex creates missing MOC, idempotent (apply twice → one line), replaces
  an existing line when label changes; cache invalidation (write → immediate ↓
  graph() sees the node).
- Extend apps/api/test/memory.e2e.test.ts: POST note → GET note → graph gained ↓
  node+edge (roadmap's write + re-read + graph update); PATCH → changed body +
  preserved frontmatter; append; updateIndex twice → idempotent + MOC ↓
  auto-created; 409 / 422 / 404 paths.
  ↓
  4.2 Run lifecycle: ground → work → record
  ↓
  Grounding:  — ✅ DONE (commit "phase 4.2: grounding")
  ↓
- NEW apps/api/src/memory/grounding.service.ts (provided + exported by
  MemoryModule). compose({ task, projectId?, matchedTerms? }): Promise<string>: ↓
  North Star (note north-star) + top-2 term-matched MOCs (decision 5) + project
  note (note(projectId) when given) → a ## Grounding (vault) block, each note ↓
  as ### <title> + truncated body; "" when nothing found; try/catch → ""
  with a warn log. Export the selection as a pure helper ↓
  (selectIndexes(terms, entries)) for unit tests. Export tokenize from
  apps/api/src/tasks/keyword-scorer.ts and import it here (no drift). ↓
- claude-run-command.service.ts: ClaudeRunOptions.grounding?: string;
  withOperatingContract(instructions, grounding?) (:113–115) → contract + ↓
  grounding + body; buildClaudeCommand threads it (:204–205). Nothing else
  changes — the flag matrix stays a pure unit surface. ↓
- agent-runner.service.ts: AgentsModule imports MemoryModule; inject
  GroundingService; start() (:118–129) and startOrchestrator() (:140–147) ↓
  gain matchedTerms?: string[]; launch() composes AFTER resolveProject (:178)
  with { task: prompt, projectId: resolved?.id, matchedTerms }; buildCommand ↓
  (:401–420) passes grounding.
- pipeline-runner.service.ts: PipelinesModule imports MemoryModule; ↓
  start(pipelineId, taskId?, projectRef?, matchedTerms?) (:161) persists
  matchedTerms on the aggregate; PipelineRunSchema gains ↓
  matchedTerms: z.array(z.string()).optional() (pipeline-run.schema.ts:64–96);
  buildStageCommand's claude branch (:784–814) composes per stage with ↓
  { task, projectId: project?.id, matchedTerms: run.matchedTerms }. Demo and
  verify stages: untouched (no system prompt). ↓
- task-scheduler.service.ts dispatch() (:189–204): pass routing.matchedTerms
  to all three start calls. ↓

Recorder: ↓

- NEW apps/api/src/memory/run-recorder.service.ts + run-recorder.module.ts ↓
  (imports MemoryModule, AgentsModule, PipelinesModule, ProjectsModule); register
  in app.module.ts. Shape mirrors TaskSchedulerService: onModuleInit subscribes ↓
  both runners' onRunStatus (terminal only), onApplicationBootstrap sweeps
  list() of both runners for terminal runs without a marker; onModuleDestroy ↓
  unsubscribes.
- record(run): fileExists(<run.cwd>/memory-recorded.json) → skip; write marker ↓
  (writeFileAtomic) FIRST (decision 8); then vault.appendDaily(line). Lines:
  agent → run <runId> (<agentId>${title}) → <status> + · [[<projectId>]] ↓
  when the project resolves; pipeline → pipeline <id> (<pipelineId>) → <status> · <n> stages + project/learned wikilinks.
- Delivery trace: pipeline done → pipelineRunner.readArtifact(id, "learned.md") ↓
  (add "learned.md" to PIPELINE_RUN_ARTIFACTS, pipelines.contract.ts:21). Found
  → vault.createNote({ id: "learned-" + pipelineRunId, tier: "knowledge", … }) ↓
  (tolerate DuplicateNoteError — sweep race), then
  vault.updateIndex(projectId, "learned-" + pipelineRunId, title) when the ↓
  project resolves from run.projectPath (the projectForRun rule :259–269). Daily
  line gains [[learned-…]]. ↓
- dokumentator.md (apps/api/data/agents/): new step — kromě docs.md zapiš
  learned.md do téže složky: 1–5 odrážek TRVALÝCH poznatků o projektu/doméně ↓
  (co platí i příště; žádné běhové detaily, žádný changelog). Mirror to any
  data-test copy if one exists (POLICY.md precedent — verify at impl time). ↓
- demo-stage.mjs: env knob PIPELINE_DEMO_EMIT_LEARNED (default OFF) — when set,
  the stage whose phase id matches its value also writes a deterministic ↓
  learned.md next to its produces file.
- fake-claude.mjs: env knob FAKE_CLAUDE_DUMP_ARGS_FILE (default OFF) — dump argv ↓
  as JSON to the given path, so an e2e can assert the grounding text actually
  reached --append-system-prompt. ↓

Tests: ↓

- NEW apps/api/src/memory/grounding.service.test.ts (temp fixture vault: ↓
  north-star + two MOCs + a project note + noise): North Star always first;
  matchedTerms pick the right MOC; no matchedTerms → tokenized-task fallback picks ↓
  the same; top-2 cap; per-note and per-block truncation; empty vault → "";
  missing north-star → block still composes from the rest; unreadable vault → "" ↓
  (never throws).
- claude-run-command.service.test.ts: matrix rows for grounding present/absent — ↓
  assert ORDER (contract, grounding, body) inside --append-system-prompt.
- NEW apps/api/src/memory/run-recorder.service.test.ts (stub runners + temp ↓
  vault): terminal agent status → one daily line; duplicate emission → still one
  (marker); bootstrap sweep records a pre-existing terminal run; pipeline done + ↓
  learned.md → knowledge note created, project MOC gained the wikilink, daily
  line carries both links; pipeline failed → daily line only; non-terminal ↓
  statuses ignored.
- e2e: extend agent-runs/tasks e2e — demo run finishes → GET ↓
  /api/memory/note/<today> body contains the runId (recorder is mode-agnostic);
  extend pipelines.e2e — demo pipeline with PIPELINE_DEMO_EMIT_LEARNED → done → ↓
  daily entry, learned-<runId> note readable, project MOC contains the link,
  /memory/graph has the new node+edge; restart-shaped dedup: re-init the app over ↓
  the same data dir → still exactly one daily line. Grounding e2e (claude mode,
  fake-claude + FAKE_CLAUDE_DUMP_ARGS_FILE + seeded temp vault): dumped ↓
  --append-system-prompt contains the North Star title; empty vault → no
  grounding header. ↓

  4.3 Memory UI write surfaces ↓

- queries: NEW useMemorySearchQuery(q) (["memory","search",q], enabled on ↓
  non-blank, selectApiResponseBody) beside the existing two; export query keys.
- mutations: NEW features/memory/mutations/ — useCreateNoteMutation, ↓
  useUpdateNoteMutation (apiClient.memory.\*.useMutation, onSuccess →
  qc.invalidateQueries({ queryKey: ["memory"] }) — root invalidation refreshes ↓
  graph, notes, search in one move).
- NEW features/memory/components/NoteEditorDialog.tsx (AgentDetailModal pattern, ↓
  DS Dialog lg): create mode — title Input (id auto-slugged from title, editable
  before save), tier Dropdown (default knowledge), body via DS MarkdownEditor; ↓
  edit mode — id/tier read-only caption, title + body editable, prefilled from
  useNoteQuery. Save → mutation → close → onSaved(id) selects the note. ↓
  NoteEditorDialogTestId enum (note-editor-dialog, note-editor-title,
  note-editor-id, note-editor-tier, note-editor-save). ↓
- Screen.tsx: header toolbar — DS SearchBar (testid memory-search-input) showing
  hits (memory-search-hit-<id>, click → setSelected), tier Chip row ↓
  (All/memory/daily/knowledge, testid memory-tier-<tier>) filtering BOTH graph
  and hits; "New note" Button (memory-note-new); note panel gains "Edit" ↓
  (memory-note-edit). Pure helper filterGraphByTier(graph, tier) (nodes + edges
  whose both ends survive) in features/memory/filterGraph.ts. NEW DailyTimeline ↓
  panel (memory-daily-<id> rows): graph nodes tier "daily", ids are dates → sort
  desc, click selects. Empty-vault EmptyState keeps the New-note button so the ↓
  first note is creatable.
- i18n: memory._ keys in apps/web/i18n/messages/{cs,en}.json (searchPlaceholder, ↓
  newNote, editNote, save, tier._, dailyTimeline, idLabel, titleLabel,
  bodyLabel); messages.test.ts parity stays green. ↓

Tests: ↓

- web-components: NoteEditorDialog.test.tsx (create: title → slug id, save fires ↓
  POST body {id,tier,title,body}; edit: prefilled, PATCH body without id/tier);
  filterGraph.test.ts (edges dropped when an endpoint is filtered). ↓
- Playwright memory-graph.spec.ts extends the throughline: create a note via the
  dialog → memory-node-<id> appears in the graph (roadmap's spec); search ↓
  "orchestrator" → hit opens the zibby note; tier chip "knowledge" hides the
  MEMORY node; daily timeline shows today's entry. global-setup.ts:70–75 seeds ↓
  additionally north-star.md + daily/<today>.md.
  ↓

---

Verification ↓

After each sub-item: pnpm lint → npx tsc -p apps/web/tsconfig.json --noEmit ↓
(rtk typecheck lies) → pnpm test → pnpm exec vitest run --project web-components.
↓
Phase exit: pnpm e2e green on a clean tree (the 2 quarantined pipeline e2e tests
stay quarantined; memory-graph.spec had pre-existing reds on some trees — ↓
establish the clean-tree baseline via git worktree BEFORE the phase, never
stash/pop). Then the manual proof per the roadmap exit criterion: run a task and a ↓
delivery pipeline against a registered project and ask "what did you do yesterday
and what do you know about project X" — daily/<date>.md lists the runs with ↓
outcomes and links, knowledge/<projectId>.md links the learned notes, and the
answer assembles from those files (open them in the memory UI), not from chat ↓
context.
↓
Watch-outs
↓

- The 5 s scan cache is a stale-read trap: EVERY new write path must null
  this.cache (appendDaily already does, :115) or the write+re-read e2e flakes. ↓
- Note ids are vault-unique by contract — createNote's duplicate check must scan
  ALL tiers; note(id) returns the first basename match, so a per-dir check ↓
  would create shadowed, unreachable notes.
- resolveSafeFile containment only works against FLAT dirs: always resolve ↓
  against the tier dir, never the vault root. If a later phase nests the vault
  (knowledge/projects/), the resolver — not the regex — must be revisited. ↓
- Marker-before-write ordering is deliberate (at-most-once). Moving the marker
  after the vault writes without adding daily-line dedup re-creates duplicate ↓
  entries on every crash-during-record.
- runner-core init() does NOT emit status for runs already terminal on disk ↓
  (:194–254) — the recorder's bootstrap sweep is the only path that records runs
  finishing across a restart. Don't "simplify" it away. ↓
- Grounding rides argv: keep the char caps conservative (huge notes → E2BIG /
  noisy prompts). The block must degrade to "" — never throw — or a vault ↓
  permissions issue blocks every run in the house.
- Module cycle: Agents/Pipelines → Memory (grounding) means Memory must never ↓
  import the runners; the recorder lives in its own module above both. A careless
  MemoryModule imports AgentsModule is a Nest circular-DI boot failure. ↓
- New env knobs (PIPELINE_DEMO_EMIT_LEARNED, FAKE_CLAUDE_DUMP_ARGS_FILE) default
  OFF — fake-claude/demo-stage are shared by every run-starting suite. ↓
- gray-matter stringify re-serializes YAML (key order, quoting) — only write
  files you were asked to change; never "normalize" untouched notes in a real ↓
  Obsidian vault. updateNote merges frontmatter (operator keys survive); a
  wholesale replace would eat real Obsidian metadata. ↓
- Daily note ids are dates; a hand-created 2026-06-12 note in another tier
  collides with the daily — acceptable under vault-unique ids, but the create-409 ↓
  must explain it readably.
- dokumentator instructions exist in apps/api/data/agents/ — if e2e fixture ↓
  copies of delivery agents exist (POLICY.md precedent), mirror the learned.md
  step or the pipeline e2e silently tests the old agent. ↓
- global-setup vault seeding changes feed memory-graph.spec — update spec and
  seed together, and re-verify the pre-existing-failure baseline first. ↓

Critical files ↓

- apps/api/src/memory/vault.service.ts (+ NEW grounding.service.ts, ↓
  run-recorder.service.ts, run-recorder.module.ts)
- libs/contracts/src/memory/memory.schema.ts + memory.contract.ts ↓
- apps/api/src/runner/claude-run-command.service.ts
- apps/api/src/agents/agent-runner.service.ts ↓
- apps/api/src/pipelines/pipeline-runner.service.ts (+ pipeline-run.schema.ts,
  pipelines.contract.ts) ↓
- apps/api/src/tasks/task-scheduler.service.ts + keyword-scorer.ts
- apps/api/data/agents/dokumentator.md, apps/api/data/vault/ (seeds) ↓
- apps/web/features/memory/ (Screen.tsx + NEW queries/mutations/components)
- e2e/memory-graph.spec.ts, e2e/global-setup.ts
