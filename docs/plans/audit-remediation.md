# Audit Remediation Plan — P0→P3

Source: `docs/audit/` (Fable code audit, 2026-07-12). 54 batches + `report-final.md`.
Chat-UI batches (web-chat-core/components/scene) pruned — audited code deleted/reworked.

**Execution model:** subagent-driven. Per task: read-only **verify/scope subagent**
(re-checks stale findings against current HEAD → confirmed-only spec) → **implementer
subagent** → **task review** → commit. One branch `fix/audit-remediation`, one PR at
the end, one commit per task. Controller = advisor/orchestrator; subagents do
exploration + grunt work.

**Why theme-based, not batch-file-based:** the biggest wins are shared fixes
(`withPathLock` in `EntityFileStore` closes ~15 findings; `LoggingInterceptor`
redaction closes 3 leak routes; `ClaudeCliRunner` base replaces 8 copies). Batch files
are cross-referenced into the themes below.

**Findings are unverified.** Audit subagents did not read source at orchestrator level
(only 2 spot-checks). Every task verifies against current code first — some findings
are already fixed or false-positive (report itself flagged 3 render-time-setState FPs).

---

## P0 — security + law (highest value, small effort)

- **T1 — LoggingInterceptor secrets redaction** (Critical, confirmed). Raw request body
  logged on `/projects/:id/secrets`, `/integrations/:id/credentials`,
  `/mcp-servers/:id/credentials` + chat prompts. Redaction deny-list + `skipBody`.
  `apps/api/src/shared/logging/logging.interceptor.ts`.
- **T2 — Gate floor-precedence + harden-only match-agnostic** (Critical, confirmed).
  Agent rule keyed on `tool`/`scope` shadows locked floor `pr.merge: deny`.
  `apps/api/src/gates/gate-evaluator.service.ts`.
- **T3 — `withPathLock` into `EntityFileStore` + manifest stores; fix its
  non-reentrance** (Critical×2 race + ~15 H/M). Shared storage lost-update/TOCTOU root.

## P1 — security + correctness

- **T4 — Untrusted-data delimiter for claude-CLI prompts + vault Markdown escaping**
  (Law 4). triager/briefer/distiller/chat + vault MD sinks.
- **T5 — runner `cancel()`→killGroup; approval-hook denylist expand; MCP config off
  argv**. `runner/runner-core.ts`, `claude-run-command.service.ts`.
- **T6 — Policy floor union w/ DEFAULT_FLOOR; unmatched→ask; `deploy` on floor;
  approve/reject serialize**. gates + approvals.
- **T7 — Re-entrancy guard into 5 watchers (`TickingWatcherBase`)**. channel, monitor,
  automations, task-scheduler, limit-resume.
- **T8 — `git clone` remote validation (shared `git-exec.ts`)**. workspace + self.
- **T9 — chat MCP authorization (loopback + shared-secret token)**.
  `chat/chat-mcp.controller.ts`.

## P2 — maintenance / debt

- **T10 — `ClaudeCliRunner` base** (8 spawn/parse/timeout copies → 1, + stdout buffer caps).
- **T11 — Contracts hardening** (bounds, enums, branded IDs, shared response schemas).
- **T12 — Split oversized files** (runner-core, pipeline-runner, task-scheduler,
  goal-runner; web: RunDetail, CommandLine, ProfileScreen).
- **T13 — `list()`-then-`find()` → by-id lookup + retention sweeps**.
- **T14 — Promote DS primitives from `apps/web` + shared web hooks**
  (`useLatestRef`/`usePersistedState`/`useKeyboardShortcut`/`useHoverPopover`).

## P3 — ongoing

- **T15 — Security test coverage gaps** (triager, machine open-url guard, mandate/policy
  floor, gate harden-only, approvals concurrency, file-utils path containment).
- **T16 — Dead code removal** (TaskAttachments, useStartChainMutation,
  filterGraphByProject, caffeinate toggle).

---

## Global constraints (bind every task)

- **Files are source of truth; PR is the gate** — no auto-merge, no bare push.
- After every code change: `pnpm check:lint && pnpm check:types && pnpm test` green
  before commit (typecheck via `tsc -p` direct where rtk masks — see memory).
- Contract-first: `libs/contracts` changes precede API/web.
- No `forwardRef`, no `any`, no inline `style` on DOM in `apps/web`.
- DS is the primitive source; new shared primitives go to `libs/design-system`.
- Verify each finding against current HEAD before fixing — drop stale/false-positive.
