# Local validation policy

How code gets checked, by whom, and when — for human developers and for AI coding
agents working in this repo. The rule of thumb: **validation scope grows with the
size of the commitment.** A keystroke gets the cheapest possible check; a push to a
shared branch gets a heavier one; only CI ever validates the whole repository.

## Principles

- Prefer incremental validation (changed files only) over validating the whole repo.
- Only cheap, fast checks run automatically after a file edit — feedback in a few
  seconds, not minutes.
- Expensive validation (full lint, full typecheck, full test suite, production build,
  E2E, circular-import analysis) is postponed to pre-push or CI. It never runs as a
  side effect of editing a single file.
- AI agents fix problems immediately after editing a file, before moving to the next
  one. Errors are never left to accumulate across multiple files and cleaned up in a
  batch at the end.

This mirrors the project's existing CI split (`.github/workflows/ci.yml`,
`.github/workflows/e2e.yml`): CI is already the only place that runs the full lint,
full typecheck, full test suite, `check:cycles`, and the production build. This policy
extends the same "full checks live in one place" idea down to local dev and pre-commit.

## The four tiers

| Tier           | Trigger                                     | Scope                                                                            | Runs                                                                                                      |
| -------------- | ------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **On edit**    | A file is saved / an agent finishes an edit | That file (+ its obvious test file)                                              | Lint + format that file; run its directly-related test file if one exists                                 |
| **Pre-commit** | `git commit`                                | Staged files                                                                     | Formatter + linter on staged files; incremental typecheck if any staged file is `.ts`/`.tsx`              |
| **Pre-push**   | `git push`                                  | Typecheck: whole project (tsc has no diff-scoped mode). Tests: diff vs. upstream | Full project typecheck (warm cache) + tests related to the changed files                                  |
| **CI**         | Push / PR to `main`                         | Entire repository                                                                | Full lint, full typecheck, full test suite, `check:cycles`, `check:self-knowledge`, production build, E2E |

## 1. On file save / immediately after an edit

Run only against the file(s) just changed:

```bash
pnpm exec prettier --write <file>     # formatting
pnpm exec eslint --fix <file>         # linting (flat config: eslint.config.mjs)
```

If the edited file has an obvious corresponding test file (`Foo.tsx` →
`Foo.test.tsx`), run just that test, scoped to the package that owns it (this repo's
test suite is a `vitest.workspace.ts` of six projects — `design-system`, `forms`,
`contracts`, `api`, `web`, `web-components`):

```bash
pnpm exec vitest run <path/to/Foo.test.tsx> --project web
```

Type feedback comes from the editor's TypeScript language service in real time —
don't invoke `tsc` as a substitute for it. `tsc --noEmit` type-checks the whole
project graph; it isn't file-scoped, so it does not belong in the on-edit tier.

**Do not run after a single file edit:**

- `pnpm check:lint` (repo-wide ESLint)
- `pnpm check:types` (repo-wide `tsc --noEmit`, both tsconfigs)
- `pnpm test` (all six Vitest projects)
- `pnpm web:build` (`next build`)
- `pnpm check:cycles` (madge, whole `apps/web` import graph)
- `pnpm e2e` (Playwright)

## 2. Pre-commit (`.githooks/pre-commit`)

Scope: staged files only (typecheck is the one exception — see below).

- Format + lint staged files (`lint-staged`, driven by the `lint-staged` config in
  `package.json`) — fixed files are re-staged automatically.
- If any staged file is `.ts`/`.tsx`: a full project typecheck (`tsc --noEmit` on
  `tsconfig.base.json` + `apps/web/tsconfig.json` — tsc has no diff-scoped mode, so
  this isn't actually limited to staged files), but with `--incremental` and a
  persisted `.tsbuildinfo` cache under `.cache/` (gitignored via the existing
  `*.tsbuildinfo` rule) so only what's actually affected gets re-checked. Same flags
  as package.json's `check:types:incremental` script, invoked directly as `tsc`
  rather than through that script (see the rtk note below). Measured on this repo:
  ~7-9s fully cold, low single-digit seconds once `.cache/` is warm — how much a
  given commit benefits depends on how central the changed file is (a shared
  package's public entry point invalidates more of the graph than a leaf component).
- `pnpm check:self-knowledge` — unrelated to code linting; a drift check against a
  small committed fixture, already fast and already part of this hook. Unchanged by
  this policy.
- The graphify staleness nudge — informational only, never blocks a commit.

Pre-commit does **not** run the full ESLint pass, the Vitest suite, or a build. If a
staged file is outside what `lint-staged` covers (e.g. it isn't JS/TS/CSS/JSON/MD),
it passes through untouched at the lint/format step.

## 3. Pre-push (`.githooks/pre-push`)

Scope: the typecheck is whole-project (see above — tsc can't be scoped to a diff);
only the test step is scoped to the branch's diff against its upstream.

- A full project typecheck, same `--incremental` + `.cache/` mechanism as
  pre-commit's — heavier than the on-edit tier, but still local and bounded to a few
  seconds when the cache is warm (which it usually is, since pre-commit already
  primed it), rather than the ~7-9s cold `check:types` takes.
- `pnpm exec vitest run --changed <upstream-ref>` — only the tests related to files
  changed on the branch, not the entire suite.

Pre-push is the last local gate before code leaves the machine. It does not run
`check:lint` project-wide (already covered incrementally by every commit that got you
here), `check:cycles`, `web:build`, or `e2e` — those stay in CI.

**rtk.** Both hooks run their tsc invocation as `rtk tsc <flags>` (not
`pnpm exec tsc`/`pnpm run check:types:incremental`) when the operator's `rtk` CLI
proxy (`~/.claude/RTK.md`) is on `PATH` — rtk's dedicated tsc filter (grouped-by-file
errors) only fires when tsc is the literal command it sees; routed through a `pnpm`
wrapper it's unfiltered passthrough. Falls back to plain `pnpm exec tsc` when rtk
isn't installed. `lint-staged`/`check:self-knowledge`/`vitest --changed` are wrapped
with `rtk` too when present, but pnpm-wrapped invocations don't get a dedicated
filter — it's a safe no-op, not a real savings, there. Git commands whose output the
hooks parse for control flow (`git diff --cached ...`, `git rev-parse ...`) are never
routed through rtk, since its compacted format isn't guaranteed machine-parseable.

Note: editing a root-level config/manifest file (`package.json`, `eslint.config.mjs`,
a `tsconfig*.json`) widens what `--changed` treats as affected, since most packages
depend on it — expect close to a full run in that case. That's inherent to how the
dependency graph works, not a flaw in the hook; day-to-day edits stay narrowly scoped.

## 4. CI (`.github/workflows/ci.yml`, `.github/workflows/e2e.yml`)

CI is the only place the full-repository checks run:

- Full lint — `pnpm exec eslint .`
- Full typecheck — `pnpm run check:types`
- Circular-import check — `pnpm run check:cycles` (madge, `apps/web`)
- Full unit/integration suite — `pnpm run test` (all six Vitest projects)
- Self-knowledge drift check, pinned to the committed fixture data dir
- Production build — `pnpm run web:build`
- End-to-end tests — Playwright, PR + `workflow_dispatch` on `ubuntu-latest`, plus a
  self-hosted macOS run on push to `main` (`.github/workflows/e2e.yml`)

If security scanning or other expensive analysis is added later, it belongs here too
— never in the on-edit, pre-commit, or pre-push tiers.

## AI agent workflow

When an agent edits a file:

1. Edit the file.
2. Run only the on-edit validation for that file (§1 above).
3. If it fails, fix it immediately — before touching another file.
4. Repeat until it passes.
5. Move to the next file/task.

An agent never lets lint or type errors pile up across several edited files to fix
in one pass at the end. The full local sequence CLAUDE.md used to prescribe after
every change (`check:lint`, `check:types`, `test` — all repo-wide) is superseded by
this policy; see CLAUDE.md's "After editing a file" section for the enforced,
short version of this rule.

## Performance goals

The local validation workflow optimizes for:

- Minimal latency — feedback in a few seconds, not minutes.
- Minimal CPU usage — no whole-repo recompilation/analysis on every keystroke.
- Incremental execution — cost scales with the size of the change, not the size of
  the repo.
- Deterministic behavior — the same edit produces the same local check result
  regardless of unrelated files elsewhere in the tree.
- Fast developer feedback — a human or agent finds out about a problem before
  they've moved on to the next file, not minutes later in a CI run.

Running project-wide commands (`check:lint`, `check:types`, `test`, `web:build`,
`check:cycles`, `e2e`) after every file modification is explicitly discouraged — that
cost belongs at pre-push (typecheck + related tests only) or CI (everything else).
