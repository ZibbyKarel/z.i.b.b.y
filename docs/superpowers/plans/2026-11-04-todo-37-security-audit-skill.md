# Security-audit skill in the security-audit workflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The `audit` phase of `.zibby/data/workflows/security-audit.workflow.md` runs the installed external `/security-audit` skill, proven by a fake-claude e2e.

**Architecture:** Phase-level `skill:` already exists (`WorkflowPhaseSchema.skill`, resolved in `WorkflowRunnerService.buildStageCommand`, rendered by `buildStageTask` as `## Skill /<name>` plus an `--add-dir` grant on the skill folder). Only data + test change.

**Tech Stack:** NestJS e2e (vitest + supertest), `apps/api/test/fixtures/fake-claude.mjs`.

**Spec:** `docs/superpowers/specs/todo-37.md`

## Global Constraints

- No real model in tests — `CLAUDE_BIN` = fake-claude.
- The test never writes into `.zibby/data`; it copies what it needs into temp dirs.

## Review Focus

- Only `audit` carries the skill; `exploit` must not — asserted in the e2e.
- The skill folder is granted (`--add-dir <ext>/security-audit`) — asserted.

---

### Task 1: Wire the skill + e2e

**Files:**

- Modify: `.zibby/data/workflows/security-audit.workflow.md` (audit phase: `skill: security-audit` + `prompt:`; body note)
- Modify: `apps/api/test/fixtures/fake-claude.mjs` (new `FAKE_CLAUDE_DUMP_ARGS_DIR`: one argv JSON per invocation)
- Create: `apps/api/test/security-audit-workflow.e2e.test.ts`

- [ ] **Step 1: Failing e2e** — boot AppModule with temp `WORKFLOWS_DIR` (copy of the production workflow), `AGENTS_DIR` (copies of the 4 security agents), `EXTERNAL_SKILLS_FILE`/`EXTERNAL_SKILLS_DIR` (copies of the record + `SKILL.md`), `AGENT_RUNNER_MODE=claude`, `CLAUDE_BIN=fake-claude`, `FAKE_CLAUDE_DUMP_ARGS_DIR`. Assert: `GET /api/workflows/security-audit` phase `audit` has `skill === "security-audit"`; start a run; wait for ≥2 dumps; the dump whose argv mentions `fázi workflow "audit"` contains `## Skill /security-audit` and an `--add-dir` ending in `security-audit`; the `exploit` dump does not contain `/security-audit`.
- [ ] **Step 2: Run, expect FAIL** (no skill on the phase / dump dir unsupported).
- [ ] **Step 3: Implement** the fake-claude dump dir and the workflow change.
- [ ] **Step 4: Run** `pnpm exec vitest run apps/api/test/security-audit-workflow.e2e.test.ts` → PASS; also `apps/api/test/workflows.e2e.test.ts` (fixture change regression).
- [ ] **Step 5: Commit.**
