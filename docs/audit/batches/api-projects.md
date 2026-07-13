BATCH: api-projects

[SEVERITY: Critical] [FILE: apps/api/src/shared/logging/logging.interceptor.ts:53-63 (entry point: apps/api/src/projects/projects.controller.ts:119 setProjectSecrets)] [CATEGORY: Security — secrets leak into logs]
`isNoisyBodyRoute` only skips `/logs` URLs; `PUT /api/projects/:id/secrets` is not excluded, so the global `LoggingInterceptor` logs the raw request body (`{ DB_URL: "postgres://...", API_KEY: "..." }`) at `info` level, unredacted (truncated to 1000 chars only). This directly contradicts `ProjectSecretsStore`'s own doc comment claiming secrets are "NEVER logged." (KŘÍŽOVÝ nález — interceptor je v api-shared-root batchi; ověřit tam i jiné secret-bearing routes: integrations credentials, project env.)
Add a route/field-based redaction rule (or a `skipBody` allowlist entry for `/secrets`) in the logging interceptor.

[SEVERITY: Medium] [FILE: libs/contracts/src/projects/project.schema.ts:155] [CATEGORY: Security — data model asymmetry]
`env` is an open `z.record(z.string(), z.string())` with no secret-shaped-key guard, unlike integration configs which use closed `.strict()` schemas. `env` values ARE returned verbatim in every GET/list response, so an operator mistakenly putting a real credential there (instead of `/secrets`) leaks it in plaintext on every `listProjects` call. (Potvrzuje contracts-c nález o project.env.)
Add a denylist/refinement on `env` keys (reject `TOKEN|SECRET|PASSWORD|KEY|CREDENTIAL`) or document the risk in the UI.

[SEVERITY: Medium] [FILE: apps/api/src/projects/projects.controller.ts:90-98] [CATEGORY: Performance — N+1]
`listProjects`/`searchProjects` call `withSecretState` per project, each doing an independent `fs.access` via `ProjectSecretsStore.has()` — N filesystem syscalls per list call.
Batch: list the secrets directory once and check membership in a `Set`.

[SEVERITY: Medium] [FILE: apps/api/src/projects/projects.controller.ts:72-78, resolved-project.service.ts:64-83] [CATEGORY: Duplicate logic / Performance]
`resolveContext` runs `resolve()` and `resolveCompanyRef()` in parallel; both independently call `findCompany`/`companies.get()`, so a single `GET /projects/:id/resolved` does two redundant full company-store reads.
Have `resolve()` optionally return the resolved company so `resolveContext` fetches it once.

[SEVERITY: Low] [FILE: apps/api/src/projects/project-vault.service.ts:22-38] [CATEGORY: Error handling]
`write`/`remove` swallow every error with an empty `catch {}` and zero logging — any real bug (permissions, disk full, template failure) in the vault mirror is invisible.
Log the swallowed error at debug/warn before discarding.

[SEVERITY: Low] [FILE: apps/api/src/projects/standup.service.ts:71] [CATEGORY: Error handling]
`activity.readSince(...).catch(() => [])` silently turns any activity-log failure into an empty result — a broken activity source renders a misleading "nothing happened" standup.
Log the caught error before falling back to `[]`.

[SEVERITY: Low] [FILE: apps/api/src/projects/projects.storage.service.ts:75-79] [CATEGORY: Performance]
`get(id)` reads, parses, schema-validates and backfills the ENTIRE manifest just to find one record; every controller action funnels through this, compounding with the same list()-then-find pattern in CompaniesStorageService.
Acceptable at current scale; consider an in-memory indexed cache if the registry grows.

[SEVERITY: Low] [FILE: apps/api/src/projects (missing controller test)] [CATEGORY: Test coverage]
No controller-level unit test inside this directory for `ProjectsController`; coverage lives in `apps/api/test/projects.e2e.test.ts` (outside dir, but covers it well — verified: hasSecrets flip, secret never in response body, secret only under PROJECT_SECRETS_DIR, cascade delete).
Optionally add a co-located controller spec.

[SEVERITY: Low] [FILE: libs/contracts/src/projects/project.schema.ts:144-147] [CATEGORY: Attack surface / info]
`checks: string[]` (shell commands, `&&`-joined downstream) accepted with only non-empty constraint — no injection-shaped validation. Operator-only write path, not exploitable from here.
Confirm the consuming pipeline-verify code treats `checks` as trusted operator input only, never inbound-channel-derived.

STATS: 24 files, 2992 lines. Top 3: projects.storage.service.test.ts (280), projects.storage.service.ts (249), project-local.service.test.ts (215).
Pozitivum (e2e ověřeno): secret nikdy v response body, jen pod PROJECT_SECRETS_DIR, cascade delete funguje. Jediný leak je logging interceptor výše.
