# Phase 125 — Runner & git-exec hardening

> `docs/audit/report-final.md`, High rows:
> - _"`runner/runner-core.ts:551` — `cancel()` zabije jen leadera, ne detached process group
>   → osiřelé nástroje přežijí 'stop'. Doporučení: `killGroup(pgid)` jako všude jinde."_
> - _"`runner/claude-run-command.service.ts:151` — Approval hook denylist NErozpozná
>   `mv`/`>`/`cp`/`sed -i`/`/bin/rm` — kontrakt slibuje 'covers overwrite, move'. Doporučení:
>   rozšířit denylist nebo sladit text kontraktu."_
> - _"`runner/claude-run-command.service.ts:466` — MCP config se secrety (Bearer token,
>   headers) inline v argv → viditelné přes `ps`. Doporučení: předat config souborem, ne argv."_
> - _"`workspace/workspace.service.ts:187` — `git clone` remote bez scheme validace →
>   `ext::sh -c` (git ext-transport RCE třída). Doporučení: allowlist scheme; reject
>   `ext::`/leading-dash; `--` separator."_
>
> Cross-cutting recommendation #7: _"Sdílený `git-exec.ts` (bounded execFile + remote
> validace) pro workspace + self service."_

## Recon (verified)

**Process-group teardown.** `apps/api/src/runner/runner-core.ts` spawns every run
`detached: true` (l.408, l.498), so the child leads its own process group
(`handle.run.pgid = child.pid`, l.417/l.505) — its tool-call children (npm test, git, …)
share that group. `killGroup(pgid)` already exists (l.1233-1244, exported) and is already used
by every other teardown path:
- `cancel()`'s `awaiting-approval` branch — l.536
- `denyIntent()` — l.581
- `reapOnShutdown` — l.789
- the orphan/limit-pause monitor — via `killGroup` at l.375 (`monitorPgid`)

Only `cancel()`'s **live-run branch** (l.545-552) diverges: `handle.child.kill()` (l.551) sends
`SIGTERM` to the leader PID only — Node's `child.kill()` never targets the process group. This
is the exact operator-facing "Stop" button (`RunnerCore.cancel` on a `running` run), so every
manual stop currently orphans in-flight tool subprocesses. Confirmed, not assumed — `killGroup`
is a drop-in replacement already proven correct three call sites over.

**Approval-hook denylist.** The gate contract text lives in
`apps/api/src/runner/claude-run-command.service.ts:151` (`OPERATING_CONTRACT`): _"This covers
delete, overwrite, move, and any other external effect."_ The actual matcher is
`apps/api/src/runner/claude-approval-hook.mjs`, function `isDestructive` (l.116-121):

```js
function isDestructive(command) {
  if (RM_FAMILY.test(command)) return true;
  if (/\bfind\b[\s\S]*\s-delete(\s|$)/.test(command)) return true;
  if (/\bgit\s+clean(\s|$)/.test(command)) return true;
  return false;
}
```

`RM_FAMILY` (l.67) is `/(^|[\s;&|(\`])(rm|rmdir|unlink|shred|trash|trash-put)(\s|$)/` — no `/`
in the leading boundary class, so `/bin/rm foo` slips through (also flagged standalone as
Medium in the batch, `claude-approval-hook.mjs:67`). Beyond that gap, the matcher has **no
rule at all** for `mv`, `cp` (overwrite), output redirection (`>`, `>>`), `sed -i`, `dd`,
`truncate`, `tee`, or `install` — every overwrite/move idiom the contract text promises is
unguarded. `classify()` (l.355-363) is the single dispatch point (`classifySegment` → git push/
PR → `gh api` → `isDestructive` fallback) — the natural seam to extend. Denylist scope is
Bash-only (`classifyEvent`, l.408-425 only classifies `tool_name === "Bash"` / `"Task"`); no
change needed there.

**MCP config on argv.** `buildClaudeCommand` (claude-run-command.service.ts:408-483) calls
`buildMcpConfig(mcpServers)` (l.586-614), which merges each enabled server's secret credential
into its config: stdio servers get `creds.env` (l.598), http/sse servers get `creds.headers`
plus `Authorization: Bearer <authToken>` folded in (l.601-605) — real secrets, not placeholders.
The result is pushed straight onto argv: `if (mcpConfig) args.push("--mcp-config",
JSON.stringify(mcpConfig))` (l.466) — visible to any local user via `ps`/`/proc/<pid>/cmdline`
for the run's lifetime.

The system prompt already solved this exact problem one field over. `buildSystemPromptArgs`
(l.492-501): when a `systemPromptDir` is supplied it writes the prompt to
`<dir>/.zibby-system-prompt.md` (`SYSTEM_PROMPT_FILE`, l.297) and passes
`--append-system-prompt-file <path>` instead of the inline flag; with no dir it falls back to
inline `--append-system-prompt <text>`. `systemPromptDir` is wired from the caller,
`AgentRunnerService.launch` (`apps/api/src/agents/agent-runner.service.ts:758`):
`...(sandboxCwd ? { systemPromptDir: sandboxCwd } : {})` — the run's own sandbox dir, created by
`RunnerCore` on spawn, already private to the run. No `chmod` is applied to the prompt file
today (confirmed by reading `buildSystemPromptArgs` — it's a plain `fs.writeFile`), so this plan
mirrors that existing posture rather than inventing stricter permissions unprompted.

**Git clone remote validation.** `apps/api/src/workspace/workspace.service.ts`, `clone()`
(l.187-195):

```ts
async clone(remote: string, dir: string): Promise<void> {
  try {
    await exec("git", ["clone", remote, dir], { timeout: GIT_NETWORK_TIMEOUT_MS });
```

`remote` reaches here from `project.gitRemote`, typed `z.string().min(1).optional()`
(`libs/contracts/src/projects/project.schema.ts:200`) — no scheme or shape constraint. `exec` is
`promisify(execFile)` (l.9), so shell metacharacters can't inject a second command, but git's own
`ext::` transport (`git clone 'ext::sh -c ...'`) IS arbitrary command execution reached entirely
through argv, and a leading-dash remote (`--upload-pack=...`) is argv-option injection — neither
is blocked by `execFile` alone. Every other `exec("git", …)` call in this file passes
caller-controlled data only into ref/path positions already validated upstream (branch slugs
sanitized by `sanitizeBranchSlug`, l.40-49; `dir`/`cwd` are machine-local paths) — `clone`'s
`remote` is the one unvalidated argv-injection surface in the file.

**Cross-cutting #7 — shared git-exec.** `apps/api/src/self/self.service.ts` independently
defines the identical `exec = promisify(execFile)` wrapper (l.8) with its own
`GIT_TIMEOUT_MS`/`GIT_NETWORK_TIMEOUT_MS` constants (l.11, l.15) — verbatim duplicated from
`workspace.service.ts` (l.9, l.12, l.19), down to the docstring ("Mirrors WorkspaceService's
posture", l.58). `SelfService` never takes an external remote (`installRoot()`'s own `origin`
only — l.75-135, l.220 `git pull --ff-only origin <branch>`), so it doesn't need the scheme
allowlist itself, but it is the second consumer that makes a shared `bounded execFile + git
helper` module worth extracting now rather than fixing `workspace.service.ts` alone. Placement:
`apps/api/src/shared/` is flat (`retry.ts`, `worktree-root.ts`, `data-dir.ts`, …) — `git-exec.ts`
fits the existing convention.

## Goal

- The operator's "Stop" always reaps the whole process group — no orphaned tool subprocess
  survives a cancel.
- The approval-hook denylist matches what `OPERATING_CONTRACT` promises: overwrite and move are
  gated, not just delete.
- MCP secrets (bearer tokens, headers, env) never appear in `ps`/`/proc/<pid>/cmdline` for a run
  that has a sandbox dir; the existing argv fallback is kept only for the no-sandbox case,
  matching the system-prompt precedent.
- `git clone` rejects `ext::`/other non-allowlisted transports and leading-dash/option-injection
  remotes before they reach `execFile`.
- The bounded-`execFile` + git-invocation pattern is centralized in one shared module instead of
  duplicated between `workspace.service.ts` and `self.service.ts`.

## Approach

Four independent findings; land each as its own small commit (per the phase-99-style house
convention — tight diffs, one concern per commit).

### 1. `cancel()` → `killGroup(pgid)`

In `runner-core.ts`'s live-run branch of `cancel()` (l.545-552), replace `handle.child.kill()`
with `killGroup(handle.run.pgid ?? handle.run.pid)` — the exact call already used at l.536/l.581/
l.789. No new helper needed; `killGroup` is already exported from this file. Keep
`handle.interrupting = true` as-is (unchanged reconciliation semantics — a `SIGTERM`-killed group
still reconciles to `interrupted`, not `error`, same as today).

### 2. Extend the approval-hook denylist

In `claude-approval-hook.mjs`:

- Fix the `RM_FAMILY` boundary gap (paired Medium finding, `claude-approval-hook.mjs:67`): add
  `/` to the leading boundary class so `/bin/rm` matches — `/(^|[\s;&|(\`/])(rm|rmdir|unlink|
  shred|trash|trash-put)(\s|$)/`. Verify this doesn't false-positive on paths merely containing
  `rm` as a substring of a longer segment (the trailing `(\s|$)` boundary already guards that).
- Add a new `OVERWRITE_FAMILY` (or extend `isDestructive`) covering the idioms the contract
  promises: `mv`, `cp` (when it can overwrite — treat any `cp` as gated, matching the
  coarse-grained posture of the existing `rm` matcher rather than trying to detect `-n`/
  no-clobber), output redirection (`>`, `>>` — NOT `2>&1`/`<`, careful not to match those),
  `sed -i` / `sed --in-place`, `dd`, `truncate`, `tee` (writes, not `tee -a` specifically —
  both overwrite/append a file), `install`. Follow the existing pattern: a same-shaped regex
  family plus a boundary class, OR'd into `isDestructive`, so `enrich("delete", …)` (which is
  reused for the generic "destructive" card — check whether a rename to a more general risk
  label, e.g. keeping `action: "delete"` but adjusting `riskType`/`summary` copy for
  overwrite/move, is warranted; simplest is to keep `action: "delete"` since the gate/contract
  side doesn't discriminate delete vs. overwrite today — confirm no floor rule keys on
  `riskType` before deciding to fork it).
- Decide the doc-vs-code alignment explicitly per the audit's stated preference ("recommend
  extending"): extend the code to match `OPERATING_CONTRACT`'s existing promise rather than
  softening the contract text.
- Redirection needs care in the tokenizer/regex: `>`/`>>` must be detected as a shell operator
  applied to a command, not confused with a comparison inside a quoted string the existing
  `tokenize()` already unquotes. Test against `echo hi > file`, `cmd 2>&1` (must NOT match, it's
  stderr redirection to a fd, not a file overwrite... note: this is a known best-effort
  denylist, documented as leaky in the file's own header comment — don't over-engineer a shell
  parser here, match the existing regex-heuristic posture).

### 3. MCP config off argv when a sandbox dir exists

In `claude-run-command.service.ts`, mirror `buildSystemPromptArgs`'s file-vs-inline split for
the MCP config:

- Add an `mcpConfigDir`-style parameter (reuse `opts.systemPromptDir` — the same sandbox dir; no
  need for a second option) and a new private `buildMcpConfigArgs(mcpConfig, sandboxDir)`
  helper: when `sandboxDir` is given, write `JSON.stringify(mcpConfig)` to
  `path.join(sandboxDir, MCP_CONFIG_FILE)` (new constant, sibling to `SYSTEM_PROMPT_FILE`, e.g.
  `.zibby-mcp-config.json`) and return `["--mcp-config", file]` — `claude`'s `--mcp-config` flag
  accepts either an inline JSON string or a path; confirm this against the CLI's actual flag
  semantics before wiring (spike/read `claude --help` output or existing precedent) since unlike
  `--append-system-prompt-file` there may not be a separately-named file flag — verify whether
  `--mcp-config` auto-detects a path vs. JSON, or needs a distinct flag.
- When no `sandboxDir`, keep today's inline `JSON.stringify(mcpConfig)` argv behavior (documented
  fallback, same posture as the system prompt).
- Update the call site (l.438-466) to route through the new helper instead of the bare
  `args.push("--mcp-config", JSON.stringify(mcpConfig))`.
- No chmod/cleanup beyond what `buildSystemPromptArgs` already does today (the sandbox dir's
  lifecycle — created by `RunnerCore` on spawn, removed with the run's workspace — already owns
  cleanup; don't invent new cleanup this file doesn't already do for the sibling prompt file).

### 4. Shared `git-exec.ts` + remote scheme validation

- New `apps/api/src/shared/git-exec.ts`: hoist `exec = promisify(execFile)`,
  `GIT_TIMEOUT_MS`/`GIT_NETWORK_TIMEOUT_MS` (rename to generic, non-workspace-specific names —
  check for naming collisions in call sites), and a thin `gitExec(args, opts)` wrapper. Both
  `workspace.service.ts` and `self.service.ts` import from here instead of each declaring their
  own promisified `execFile` + timeout constants.
- Add a `validateGitRemote(remote: string): void` (throws on rejection) in the same module:
  - Reject any value starting with `-` (argv-option injection guard) — applies to remotes
    generically, not just `clone`.
  - Allowlist scheme: accept `https://`, `git://`, `ssh://`, `git@<host>:<path>` (the scp-like
    syntax), and bare local filesystem paths only if that's an existing legitimate use (check —
    if not needed, drop `file://`/bare-path support and require a scheme). Reject `ext::`
    explicitly (and any other non-allowlisted `word::` transport prefix) — git's ext-transport
    RCE class named directly in the audit.
  - Call `validateGitRemote(remote)` at the top of `WorkspaceService.clone()` before the `exec`
    call; let it throw (caller already wraps in try/catch and maps to `WorkspaceSetupError`, so
    a validation throw there naturally surfaces as the same error type — confirm the catch in
    `clone()` covers a synchronous throw before the `await exec`, not just a rejected promise).
  - Also pass a `--` end-of-options separator before the remote in the `clone` argv
    (`["clone", "--", remote, dir]`) as defense-in-depth against any remote the allowlist regex
    doesn't anticipate — confirm `git clone --` accepts this form (git clone's `--` support
    varies by subcommand; verify against the installed git version / CI git version before
    relying on it, and fall back to allowlist-only if `--` isn't supported for `clone`).
- `SelfService` migrates its `exec`/timeout constants to import from `git-exec.ts` (no remote
  validation needed there — it never takes an external remote — but the whole point of #7 is
  removing the duplication, so it still updates its imports).

## Testing

- `runner-core.test.ts`: a `cancel()` test asserting the run's process **group** is gone after
  cancel (spawn a child that itself spawns a long-lived grandchild via a test helper script,
  cancel, assert the grandchild pid is no longer alive) — the audit calls out this exact gap
  (`runner-core.test.ts:551`).
- `claude-approval-hook.test.ts`: table-driven cases for `mv a b`, `cp a b`, `echo x > f`,
  `sed -i 's/a/b/' f`, `/bin/rm f`, plus existing `rm`/`find -delete`/`git clean` cases still
  passing (no regression) and a negative case for `2>&1` (must NOT gate).
- `claude-run-command.service.test.ts`: extend/update the existing "injects an enabled MCP
  server into --mcp-config" tests (l.538, l.579) to assert that when `systemPromptDir` is
  passed, `args` contains no inline secret substring (no `Bearer`, no the literal token value)
  and instead a `--mcp-config <path>` pointing at a file whose contents match the expected
  config; keep a case for the no-`systemPromptDir` fallback asserting today's inline behavior
  is unchanged there.
- `workspace.service.test.ts`: extend the `WorkspaceService.clone` describe block (l.324) with
  rejection cases — `ext::sh -c 'touch pwned'`, `--upload-pack=/bin/sh`, a bare `-anything` — all
  rejecting before `execFile` runs (assert via a spy that `execFile`/`exec` was never called, not
  just that the promise rejects), alongside the existing happy-path clone test (l.339) staying
  green.
- New `git-exec.test.ts` (or fold into workspace's): unit tests for `validateGitRemote` in
  isolation — accept https/ssh/scp-like, reject `ext::`, reject leading `-`.
- Commands: `pnpm check:lint`, `pnpm check:types`, `pnpm test` (or scoped:
  `pnpm exec vitest run apps/api/src/runner apps/api/src/workspace apps/api/src/self
  apps/api/src/shared`).

## Effort & risk

**M** overall; each of the four findings is independently scoped and low-blast-radius:

1. `cancel()` → `killGroup` — **S**, one-line swap onto an already-proven helper. Low risk.
2. Denylist extension — **S/M**, regex-only change in an isolated pure-function module
   (`classify`/`isDestructive` are already unit-tested in isolation); risk is over-matching
   (false positives blocking legitimate commands) more than under-matching — mitigate with the
   redirection-vs-`2>&1` test case above.
3. MCP config off argv — **M**, touches the argv-building hot path (`buildClaudeCommand`) that
   many existing tests assert against; must verify `claude`'s actual `--mcp-config` file-path
   support before committing to the file-based approach (flagged as an open verification step
   above — if the flag doesn't accept a path, fall back to documenting the residual risk rather
   than inventing an unsupported CLI contract).
4. Shared `git-exec.ts` + scheme validation — **M**, refactor touches two services'
   construction/imports plus adds new validation on the one real production remote-clone path;
   `--` separator support needs a version check before relying on it. Land the extraction
   (no behavior change) separately from the validation (behavior change) if the diff wants to
   stay tight — two commits instead of one is fine here.
