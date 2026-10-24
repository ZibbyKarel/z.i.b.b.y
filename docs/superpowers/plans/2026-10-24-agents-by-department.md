# Agents by Department Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group the Agents page into department sections of glyph cards. Make sure every agent
belongs to a department: the create dialog gets a required field and the API guards updates.

**Architecture:**

- A new web composite, `AgentsByDepartment`, replaces `AgentsTable` for `kind="agents"` and
  reuses the existing, unused `AgentCard`.
- `NewAgentDialog` gains a department select.
- `updateAgent` gets the same department guard as create.

**Tech Stack:** NestJS + ts-rest, Next.js 15, TanStack Query, next-intl, DS.

**Spec:** `docs/superpowers/specs/todo-18.md` is binding.

## Global Constraints

- pnpm only. No `any`. No `forwardRef`. No inline `style` on DOM in `apps/web`. cs+en i18n. DS
  testid enums are the test selectors.
- Never touch the real `.zibby/data` (tests use temp dirs). The one exception is the regenerated
  `self-knowledge.md` when the pre-commit gate demands it: run `graphify update .`, then
  `pnpm self-knowledge:generate`, and stage it. Follow docs-sync.
- Run prettier and eslint on changed files only, then the related tests. Run `tsc` for api, web
  and contracts with `rtk proxy` and check that it exits 0. Never use `--no-verify`. Commits end
  with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- An agent whose department id isn't in the department list still appears, in "No department".
  (Task 1 test.)
- A department with zero agents renders no empty section. (Task 1 test.)
- Departments still loading (the lookup falls back to the static `DEPARTMENTS`) doesn't drop
  agents. (Task 1 test.)
- An update of a pre-backfill agent with no department succeeds as long as it names no unknown
  department. (Task 1 test.)
- Create from the dialog sends `department`, and Submit stays disabled without one. (Task 1
  test.)

---

### Task 1: Agents grouped by department, plus the department required at every write

**Files:**

- Create:
  - `apps/web/features/agents/components/AgentsByDepartment.tsx` (+ test);
  - `groupAgentsByDepartment.ts`, a pure grouping helper (+ test).
- Modify:
  - `apps/web/features/registries/screens/RegistriesScreen.tsx` (+ its test): use the composite
    for agents and pass `department` from the dialog;
  - `apps/web/features/agents/components/NewAgentDialog.tsx` (+ test);
  - `apps/api/src/agents/agents.controller.ts` (+ test/e2e);
  - i18n cs/en;
  - `docs/api/agents.md`.

**Interfaces (produced):**

- `groupAgentsByDepartment(agents: Agent[], departments: { id: string }[]): { departmentId: string | null; agents: Agent[] }[]`
  - Sections follow the department order. Empty sections are dropped.
  - Unknown or missing departments are collected into a final section with
    `departmentId: null`.
  - Agents are sorted by display name within each section.

- [ ] **Step 1: Failing tests.**
  - The helper:
    - order;
    - empty departments dropped;
    - unknown and missing departments go to the null section, last;
    - sorting within a section.
  - The composite:
    - section headers with name, code and count;
    - each card shows its agent's glyph (via `EntityCard`'s testids);
    - a card click calls the router with the detail href;
    - the error state retries;
    - the empty copy shows with no agents.
  - The dialog:
    - Submit is disabled without a department;
    - the chosen department is in the `onCreate` payload.
  - The API:
    - an update clearing the department of an agent that has one → 422;
    - an unknown department → 422;
    - an update of a department-less agent → 200;
    - a normal update → 200.
- [ ] **Step 2:** Implement until green. Run the related suites. `tsc` exits 0.
- [ ] **Step 3:** Commit `feat: Agents page grouped by department as glyph cards; every agent write requires a department`.
