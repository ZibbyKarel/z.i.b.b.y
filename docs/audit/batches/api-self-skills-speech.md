BATCH: api-self-skills-speech

[SEVERITY: Medium] [FILE: apps/api/src/self-knowledge/self-knowledge.composer.ts:132-224] [CATEGORY: Injection/Data-integrity]
`renderAgents`/`renderPipelines`/`renderSubsystems`/`renderGates` interpolate `agent.name`, `agent.description`, `pipeline.desc`, gate rule labels directly into markdown without escaping the `<!-- AUTO:KEY:START/END -->` marker strings. An entity whose name/desc contains such a marker corrupts `mergeAutoBlocks`'s regex block extraction — it can prematurely close/reopen a block, letting attacker-controlled text leak outside its AUTO block into "operator-owned" territory, or spoof a sibling block. Since this note expresses ZIBBY's own understanding of its gates/policy, a corrupted GATES/SUBSYSTEMS block is a credible confused-deputy vector.
Doporučení: escape/strip `<!-- AUTO:` / `-->` sequences from all entity-derived strings before interpolation, or use delimiters that cannot occur in user-supplied names.

[SEVERITY: Medium] [FILE: libs/contracts/src/speech/speech.schema.ts:12 + apps/api/src/speech/speech.service.ts:124-144] [CATEGORY: Performance/DoS]
`SpeechSynthesizeInputSchema.text` is `z.string().min(1)` with no `max()`. With the 5 MB global body limit, a caller can request synthesis of a very large text; `synthesize()` loads the entire WAV into memory unbounded (`Buffer.from(await res.arrayBuffer())`, then base64 ~33% larger) before returning it as one JSON body. No streaming, no size cap on the daemon output. (Potvrzuje contracts-c nález o speech text max.)
Doporučení: add a `max()` to `text` and/or cap the response body size read from speakd.

[SEVERITY: Medium] [FILE: apps/api/src/self/self.service.ts + apps/api/src/workspace/workspace.service.ts] [CATEGORY: Duplication]
`SelfService` duplicates `WorkspaceService`'s entire git-exec wrapper verbatim (`promisify(execFile)`, GIT_TIMEOUT_MS, GIT_NETWORK_TIMEOUT_MS, `isGitRepo()`); own doc comment says it "mirrors WorkspaceService's posture."
Doporučení: extract the bounded-execFile git helper into a shared `shared/git-exec.ts`. (POZN.: platí i git-clone remote validace z machine-workspace — sdílený helper by měl nést i tu.)

[SEVERITY: Low] [FILE: apps/api/src/self/self.service.ts:141-153] [CATEGORY: Robustness]
`openPrs()` parses `gh pr list` JSON with an unchecked `row as {...}` assertion instead of a Zod schema — a shape drift in gh CLI output silently produces undefined fields.
Doporučení: validate against a small Zod schema (like speech.service validates SpeechVoiceSchema).

[SEVERITY: Low] [FILE: apps/api/src/skills/ (4 souborů) ] [CATEGORY: Missing tests]
No test file for skill-categories.controller, skill-categories.storage.service, skills.controller, skills.errors — the entire skills HTTP surface (CRUD, category delete-guard, error-to-status) is exercised only indirectly. Only `skills.storage.service.test.ts` has direct coverage.
Doporučení: add controller-level tests and a unit test for the category delete-guard (409 while referenced).

[SEVERITY: Low] [FILE: apps/api/src/self/self.controller.ts, self-knowledge/self-knowledge.controller.ts] [CATEGORY: Missing tests]
Neither controller has a dedicated test — self.controller's 409-mapping for SelfDirtyError/SelfUpdateConflictError and self-knowledge's pass-through are untested at the HTTP-handler level.
Doporučení: add thin controller tests asserting the error→status mapping.

[SEVERITY: Low] [FILE: apps/api/src/self-knowledge/self-knowledge.composer.ts:104-106] [CATEGORY: Best practice]
`ascendingById` reimplements a locale-independent string comparator (sorting-by-id is cross-cutting for every catalog store); comment documents a real CI-vs-macOS collation bug it avoids.
Doporučení: promote to a shared `compareById` helper under `shared/`.

[SEVERITY: Low] [FILE: apps/api/src/self-knowledge/generate-cli.ts:41-68] [CATEGORY: NestJS best practice]
`runSelfKnowledgeCli` has no top-level error boundary around `service.write()`/`service.check()` beyond the two explicit branches — an unexpected VaultService I/O failure propagates as an unhandled rejection.
Doporučení: wrap write()/check() in try/catch that logs and sets a non-zero exit code.

STATS: 27 souborů, 3028 řádků. Top 3: self-knowledge/self-knowledge.composer.test.ts (389), self-knowledge.composer.ts (357), self/self.service.ts (233).
