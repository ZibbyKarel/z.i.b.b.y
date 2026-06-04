# z.i.b.b.y — project conventions

Design system + Next.js app. Stack: Next.js 15 App Router, React 19, TanStack Query,
**Tailwind v4** (CSS-first `@theme`), TypeScript, NX monorepo.

---

## Running the project

**pnpm is the canonical package manager** (the workspace uses the `workspace:`
protocol and `pnpm-lock.yaml`). Always use `pnpm` — never `npm` or `yarn`.

```bash
corepack enable        # or: npm i -g pnpm  (Node 20+, pnpm 9+)
pnpm install           # install all workspace dependencies

pnpm web:dev           # web app  → http://localhost:3000
pnpm api:dev           # API       → http://localhost:3333
pnpm storybook         # design system → http://localhost:6006
```

Other scripts: `pnpm web:build` / `pnpm web:start`, `pnpm api:start`,
`pnpm test` (all) / `pnpm web:test` / `pnpm api:test`, `pnpm e2e`,
`pnpm lint`, `pnpm typecheck`. See `README.md` for the full table.

---

## Monorepo structure

```
libs/
  design-system/     ← tokens, Provider, primitives, generic components, chrome
apps/
  web/               ← Next.js App Router; imports from DS, never writes its own Tailwind classes
                        domain composites live in apps/web/features/<domain>/components/
  api/               ← Node backend
```

---

## Backend (apps/api)

NestJS + ts-rest. `libs/contracts` is the single source of truth: Zod schemas →
`c.router` contract → implemented in `apps/api` via `@ts-rest/nest`, no codegen.

See `libs/contracts/README.md` for the full flow — *How to add a new endpoint*
(extend an existing resource) and *How to add a whole new resource* (new
contract + NestJS module/controller + e2e). The `health` endpoint is the
reference example for a new resource.

---

## Design system

The DS (`libs/design-system`) is the **default source of UI primitives** for all generated components.
The app composes UI from DS — it does not create its own primitives.

- When a needed primitive **doesn't exist**, decide explicitly: add it to DS, or keep the UI local in the app (domain composite). Never leave the decision implicit.

See `.claude/skills/design-system/SKILL.md` for all DS conventions (tokens, components, Tailwind v4, tests, Storybook, a11y).

### Testing (DS)

Every DS component declares a `<Component>TestId` enum naming its important parts and wires
`data-testid` onto them. Tests select elements via `getByTestId` (the primary selector) — not
`querySelector`/`firstChild`/role/text queries. Roles and ARIA are kept only as **assertions**
(`toHaveRole` / `toHaveAccessibleName` / `toHaveAttribute`); a test-id migration changes the
selector, never the assertion set. See the design-system SKILL.md *Testid enum* and *Tests* sections.

---

## Routing

App Router route group `(dashboard)`.

- `/` → redirect to `/overview`
- `/(dashboard)/layout.tsx` — server layout: Providers + `DashboardChrome`
- `DashboardChrome` — `"use client"`, reads `useSearchParams()` (under `<Suspense>`), provides `DashboardContext`
- Each page = `page.tsx` in its own segment
- `/pipelines/[id]` — pipeline detail (client, reads `useDashboardStore()`)

---

## i18n (next-intl)

- Locale in cookie, no path prefix: `i18n/request.ts` reads `cookies().get('locale')`
- `NextIntlClientProvider` in root `app/layout.tsx`
- Server: `getTranslations()`, client: `useTranslations()`
- Catalogs: `apps/web/messages/{cs,en}.json`, flat keys `t('Key', { sub: 1 })`
- DS is i18n-agnostic — string props with English defaults; app overrides with `t()`

---

## TanStack Query

Hooks live per-domain under `apps/web/features/<domain>/`, not in `libs/`. One hook
per file, split into two folders (create only the folder(s) a domain actually needs —
a query-only domain has no `mutations/`):

```
features/<domain>/
  queries/      ← one useXxxQuery per file, re-exported from queries/index.ts
  mutations/    ← one useXxxMutation per file, re-exported from mutations/index.ts
```

The hook and its file share one name with a `Query`/`Mutation` suffix
(`useAgentsQuery.ts` → `useAgentsQuery`, `useCreateAgentMutation.ts` →
`useCreateAgentMutation`).

- **Queries**: return the `useQuery` result **directly** — don't unwrap to a bare
  value. Pass `select: selectApiResponseBody` (from `state/selectApiResponseBody.ts`)
  so the ts-rest `{ status, body }` envelope is stripped and `data` is the body; call
  sites read `const { data } = useXxxQuery()` and supply their own default
  (`data ?? []`). Each query file also exports a `getXxxQueryKey()` returning the cache
  key, so mutations import it for invalidation instead of duplicating the literal.
  (A domain that needs to reshape the body composes its own `select` around the helper —
  see `useLimitsQuery`.)
- **Mutations**: return the `useMutation` result **directly** — no wrapping in
  `{ ...mutation, doThing: () => mutation.mutate(...) }`. Call sites use
  `.mutate({ params, body }, { onSuccess })` and read `.isPending` etc. off the returned
  object. The hook's own `onSuccess` (invalidation) and a call-site `onSuccess` both fire
  (hook first), so keep invalidation in the hook.

---

## TypeScript

- `strict: true` + `noUncheckedIndexedAccess`
- No `any` — use `unknown`, `satisfies`, or generics
- Props interface: `<Component>Props`, always export
- Types next to implementation (not in a separate `types.ts` unless shared)

---

## After each code generation

Run these three commands in order after generating or modifying any code files:

```bash
pnpm lint       # ESLint auto-fix (acts as project formatter)
pnpm typecheck  # tsc --noEmit
pnpm test       # vitest run
```

Fix all errors before reporting the task as done. Do not skip steps.

---

## Never do

- Write `forwardRef` (React 19 — ref-as-prop)
- Use `any` in TypeScript
- Add query hooks to `libs/` without a clear sharing reason
- Commit `.claude/settings.local.json` (it's in `.gitignore`)

---

## graphify

This project has a graphify knowledge graph at `graphify-out/`.

Rules:

- Before answering architecture or codebase questions, read `graphify-out/GRAPH_REPORT.md` for god nodes and community structure
- If `graphify-out/wiki/index.md` exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->