BATCH: api-pipelines-runner

[SEVERITY: High] [FILE: apps/api/src/pipelines/pipeline-runner.service.ts:427] [CATEGORY: state-machine / race]
resumeParked, resumeLimitPaused and resumeOutput each read the run, check its status, then `await` (pipelines.get / readAggregate) before flipping status to "running" — a TOCTOU window where two concurrent resume calls (or a resume racing an in-flight driver / the limit-resume tick) both pass the guard and spawn two concurrent `drive()` loops mutating the same `run` object and `stageRuns` array. No per-run lock or in-flight guard. (Párový vzor k race conditions v task-scheduler.)
Doporučení: Add a per-run "driving" mutex/flag set synchronously before the first await, reject re-entry while set.

[SEVERITY: High] [FILE: apps/api/src/pipelines/pipeline-runner.service.ts:1-1955] [CATEGORY: file-size / maintainability]
The service is 1955 lines and mixes start/drive state machine, limit pause/resume, output delivery, PR handling, stage-command building, artifact reading, gate evaluation, and persistence/reconstruct.
Doporučení: Extract PipelineOutputDelivery, PipelineLimitController, PipelineStageCommandBuilder, and a persistence module.

[SEVERITY: Medium] [FILE: apps/api/src/pipelines/pipeline-runner.service.ts:266] [CATEGORY: state-machine / id-collision]
`pipelineRunId = ${pipelineId}_${startedMs}` derives uniqueness solely from Date.now(); two runs of the same pipeline dispatched in the same millisecond collide on runId and run root, `mkdir(recursive)` silently shares the directory, clobbering run.json.
Doporučení: Append a short random suffix (randomUUID slice) to the run id.

[SEVERITY: Medium] [FILE: apps/api/src/pipelines/pipeline-runner.service.ts:667] [CATEGORY: missing-tests]
The operator-stop path (`stop()` → `stopRequested` → interrupted landing) has no test. A stop racing the stage's terminal transition, or firing when currentStageRunId is momentarily cleared, is unverified.
Doporučení: Add tests: stop mid-stage lands "interrupted" and suppresses retry/park; stop on non-running run throws.

[SEVERITY: Medium] [FILE: apps/api/src/pipelines/pipeline-runner.service.ts:520] [CATEGORY: missing-tests]
The entire Phase-9 usage-limit machine (boundary pause, mid-stage pause, resumeLimitPaused, parkLimitFlapped, listLimitPaused) is exercised only through a `windowExhausted → false` mock; none of the pause/auto-resume/flap-park transitions are asserted.
Doporučení: Add tests driving windowExhausted=true for boundary and mid-stage pause, a resume re-drive, and a LIMIT_RESUME_MAX flap → park.

[SEVERITY: Medium] [FILE: apps/api/src/pipelines/pipeline-runner.service.ts:1719] [CATEGORY: sensitive-data / logs]
writeFailureContext dumps the failing stage's whole log tail into `<phase>.failure.txt` and threads it (via composeResumeContext) into the next agent's prompt. A verify/shell stage that echoes a project secret (injected as env at resolveProjectEnv:1508) persists and re-emits that secret. (Párový nález k runner-aux stream-format a scheduler summary.)
Doporučení: Redact known secret values (from projectSecrets) out of failure/resume context before writing/threading.

[SEVERITY: Medium] [FILE: apps/api/src/pipelines/pipeline-runner.service.ts:628] [CATEGORY: performance]
listAll() does a full readdir + readFile + parse + safeParse of every run directory on every call, no cap/cache — O(all historical runs) per request. (Stejný vzor jako task-runs collect().)
Doporučení: Cap/paginate the scan or index metadata; cache with invalidation on writeAggregate.

[SEVERITY: Low] [FILE: apps/api/src/pipelines/pipeline-runner.service.ts:1459] [CATEGORY: performance]
tailLog and writeFailureContext both `readLog(runId, 0)` to load the entire stage log only to keep the last ~2000 chars.
Doporučení: Add an offset/tail-read path in the core (seek from EOF).

[SEVERITY: Low] [FILE: apps/api/src/pipelines/pipeline-runner.service.ts:1588] [CATEGORY: performance]
waitForStage busy-polls `core.get(runId).status` every 25ms for the full lifetime of a stage (minutes for a claude run).
Doporučení: Have the core expose a terminal-state event/promise and await it.

[SEVERITY: Low] [FILE: apps/api/src/pipelines/verify-command.ts:26] [CATEGORY: shell-exec]
Verify commands joined with `&&` under `/bin/sh -c`. Trusted-by-design (operator config), but any future path populating project.checks from untrusted data becomes command injection. (Duplicitní nález s api-pipelines-rest.)
Doporučení: Document the trust boundary; ensure project.checks is never derived from inbound channel data.

[SEVERITY: Low] [FILE: apps/api/src/pipelines/pipeline-runner.service.ts:791] [CATEGORY: state-machine / edge]
readArtifact guesses the in-flight stage folder as `stageDirName(stageRuns.length + 1, currentStage)`, but synthetic escalation markers occupy stageRuns slots and leave numbering gaps, so the guess can miss the actual folder.
Doporučení: Track the live stage's actual dir on the run alongside currentStageRunId.

[SEVERITY: Low] [FILE: apps/api/src/pipelines/pipeline-runner.service.ts:1221] [CATEGORY: duplication]
"First non-empty line" reimplemented in parsePrMarkdown and checkpointPhase; whole-log reads in tailLog/writeFailureContext/openPrOutput; phase-search-by-`produces` in recomputeHandoff and resolveOutputSource.
Doporučení: Extract shared helpers (firstNonEmptyLine, findPhaseByProduces).

STATS: 6 souborů, ~2136 source řádků. Top 3: pipeline-runner.service.ts (1955), pipeline-stage.record.ts (46), build-stage-task.ts (35). Runner service je jediný nad 600 řádků.
