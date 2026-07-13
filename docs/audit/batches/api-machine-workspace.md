BATCH: api-machine-workspace

[SEVERITY: High] [FILE: apps/api/src/workspace/workspace.service.ts:187] [CATEGORY: command-injection]
`clone(remote, dir)` passes the project `gitRemote` straight to `git clone` with no scheme/shape validation; the schema (project.schema.ts:200) is only `z.string().min(1)`. A remote like `ext::sh -c ...` (git's ext transport = arbitrary command exec) or `--upload-pack=...` / a leading-dash value (argv injection) reaches git verbatim. execFile blocks shell injection but NOT git's transport/option abuse. Operator-created (not inbound-reachable), but the classic git-clone RCE class with zero defense-in-depth.
Doporučení: allowlist the remote scheme (https/ssh/git@) and reject `ext::`/`file://`/leading `-`, or insert a `--` end-of-options separator plus a validated URL.

[SEVERITY: Medium] [FILE: apps/api/src/machine/machine.service.ts:283] [CATEGORY: security-scope]
`assertOpenableFolder` guards only `isAbsolute` + `isDirectory`; macOS `.app` bundles ARE directories, so an `open-folder` on `/Applications/X.app` launches an application while the gate detail reads only "Open folder: …" — the approver under-sees what they authorize (an app-launch primitive disguised as a folder open).
Doporučení: reject paths ending in `.app` (or resolve bundle-type) and/or make the gate detail explicit when the target is a bundle.

[SEVERITY: Medium] [FILE: apps/api/src/machine/machine.service.test.ts:1] [CATEGORY: test-gap]
The `open-url` scheme guard (`assertHttpUrl`, the fail-closed defense against `file:`/`javascript:` schemes) has ZERO test coverage. This is a stated security-critical branch ("inbound content can never coax a file:/javascript: URL through") left unexercised, including the propose-time and re-validate-at-execute paths.
Doporučení: add rejection tests for `file:`, `javascript:`, and malformed URLs at both propose and resume.

[SEVERITY: Low] [FILE: apps/api/src/workspace/workspace.service.ts:357] [CATEGORY: robustness/perf]
`diffstat`/`diffStats`/`commitLog` rely on execFile's default 1 MB stdout `maxBuffer`; a large `git log`/`diff --numstat` overflows, rejects, and is silently caught to `""`/`{0,0}`. The PR/gate decision surface then shows an empty or zeroed diff on exactly the biggest changes — a silent correctness loss.
Doporučení: set an explicit larger `maxBuffer` on the diff/log calls (and log the overflow rather than swallowing to empty).

[SEVERITY: Low] [FILE: apps/api/src/workspace/workspace.service.ts:281] [CATEGORY: duplication]
`git log --oneline ${baseRef}..HEAD` is implemented identically in `commitLog` (281) and inside `diffstat` (357); the same best-effort catch pattern is copy-pasted across five methods.
Doporučení: extract a private `gitOut(args, cwd)` helper.

[SEVERITY: Low] [FILE: apps/api/src/machine/machine.controller.ts:9] [CATEGORY: security-positive]
POTVRZENO: propose-only je strukturálně vynuceno — kontrakt exponuje jen `proposeMachineAction` + read-only list/get; NENÍ execute route. Exekuce jen přes `MachineService.resume` skrz ApprovalsService gate (Tier-3), propose/plan jen čtou disk, každý guard (absolute-folder, no path separators, http(s)-only, folder-exists) se re-verifikuje při execute. Rename operuje na readdir basenames pod validovanou složkou — no path traversal. Store id regex blokuje traversal v get(id). Bez nálezu — zaznamenáno jako požadované potvrzení Law-3/machine invariantu.

STATS: 13 souborů (machine 10, workspace 3), 1722 řádků. Top 3: workspace.service.ts (396), workspace.service.test.ts (352), machine.service.ts (312). Machine posture čistá (propose-only OK); hlavní mezera je nevalidovaný git clone remote + diff-buffer robustnost.
