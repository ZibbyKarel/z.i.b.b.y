# Team KB Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bridge widgets can be scoped to a team. A new `teamKb` widget shows a team's open questions and agreements, read from its knowledge base's meeting-note sections.

**Architecture:**

- API: `KbReaderService.digest()` is a pure, read-only section scan behind `GET /api/teams/:id/kb/digest`.
- Web:
  - `BridgeWidget.scope` plus a `configure` action in the bridge state;
  - a `TeamKbWidget` with a team picker in edit mode and two groups of rows linking to the existing team-note viewer.

**Tech Stack:** Zod 4, ts-rest, NestJS, Next.js 15 / React 19, TanStack Query, next-intl, DS.

**Spec:** `docs/superpowers/specs/todo-12.md` is binding. Exact copy, regexes and caps are there.

## Global Constraints

- The team KB is **read-only**. Nothing in this plan writes to a KB path.
- pnpm only. No `any`, no `forwardRef`, no inline `style` on DOM in `apps/web`.
- Every string goes through next-intl in cs and en, using the spec's exact copy.
- Never edit `.zibby/data/` (operator data). Tests use temp-dir KBs.
- Validate each file (prettier, eslint) and run only the related tests.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- If the self-knowledge gate blocks: run `graphify update .`, then `pnpm self-knowledge:generate`, stage the note, and retry. If docs-sync names a doc, update it.
- Never use `--no-verify`.

## Review Focus

- A heading that merely contains "questions", e.g. "Questions about pricing", is NOT a section. The match is exact after normalisation. Task 1 test.
- Nested sub-bullets and checked items are excluded. Task 1 test.
- A section ends at the next same- or higher-level heading. A deeper sub-heading inside the section does not end it, but its own list items do belong to the section. Task 1 test.
- A team without a KB returns 404, and the widget shows the no-KB copy instead of an error toast. Tasks 1 and 2.
- A layout saved with a `teamKb` widget and a `scope` round-trips through UI settings. A layout saved before this change (no `scope`) still parses. Task 2 test.

---

### Task 1: API — team KB digest

**Files:**

- Modify:
  - `libs/contracts/src/teams/team.schema.ts`: add the digest schemas and types.
  - `libs/contracts/src/teams/teams.contract.ts`: add the `getTeamKbDigest` route.
  - The contract test.
- Modify:
  - `apps/api/src/kb/kb-reader.service.ts` (+ its test): add `digest(source)`.
  - `apps/api/src/teams/teams.controller.ts`: wire it the same way as the `kb/notes` handler, including 404s.
  - The teams e2e or controller test, if one exists. Add one 404 case and one 200 case with a temp KB.
- Docs: `docs/api/teams.md`.

**Interfaces (produced):** `TeamKbDigestItem`, `TeamKbDigest`, `teamsContract.getTeamKbDigest`, and `KbReaderService.digest(source: KnowledgeBaseSource): Promise<TeamKbDigest>`.

- [ ] **Step 1: Failing tests.** In `kb-reader.service.test.ts`, use temp-dir KB fixtures, the same way the existing tests do.
  - `## Open questions` with `- A?`, `- [ ] B?` and `- [x] C?` → questions `["A?", "B?"]`.
  - `### Rozhodnutí:` with `1. Ship v2` → a decisions item with the text "Ship v2".
  - Nested `  - child` is excluded.
  - `## Questions about pricing` is not a section.
  - A section ends at a sibling `##`. A `###` inside it does not end it.
  - Order:
    - a note with `date: 2026-10-20` comes before one with `date: 2026-10-01`;
    - undated notes come last, ordered by `noteId` descending.
  - Cap: 40 items → 30.
  - Text is capped at 300.
  - `.vtt` and `_templates/` are ignored.
  - A missing root → empty lists.
  - Controller/e2e: an unknown team → 404, a team without a KB → 404, a team with a temp KB → 200 with the digest.
- [ ] **Step 2:** Run the tests and confirm they FAIL.
- [ ] **Step 3:** Implement. Keep the section parser a pure exported function: `extractDigestSections(body: string): { questions: string[]; decisions: string[] }`.
- [ ] **Step 4:** Tests PASS. `tsc` for apps/api is clean.
- [ ] **Step 5: Commit:** `feat(api): team KB digest — open questions and agreements from meeting-note sections`.

### Task 2: Web — widget scope + `TeamKbWidget`

**Files:**

- Modify:
  - `libs/contracts/src/system/system.schema.ts`: add `"teamKb"` to the `BridgeWidgetSchema` type enum, and the optional `scope`.
  - Its schema test, if one exists.
- Modify:
  - `apps/web/features/bridge/state/useBridgeState.ts` (+ test): add `configure(id, scope)` on the draft.
  - `registry.tsx`: add `onScopeChange` to `BridgeWidgetProps` and the `teamKb` entry.
  - The widget frame/board that renders `Component`: pass `onScopeChange={(s) => configure(widget.id, s)}`. Find where `WIDGETS[type].Component` is rendered.
- Create:
  - `apps/web/features/teams/queries/useTeamKbDigestQuery.ts` (+ export), exporting `getTeamKbDigestQueryKey(teamId)`.
  - `apps/web/features/bridge/widgets/TeamKbWidget.tsx` (+ test), following the `QuickActionsWidget`/`TodoWidget` structure and `useWidgetReport`.
  - Use `export enum TeamKbWidgetTestId { TeamSelect = "team-kb-widget-team-select", Pick = "team-kb-widget-pick", NoKb = "team-kb-widget-no-kb", Questions = "team-kb-widget-questions", Decisions = "team-kb-widget-decisions", Row = "team-kb-widget-row" }`.
- i18n cs/en: `bridge.widget.teamKb.*` (label, desc and the widget's copy).

- [ ] **Step 1: Failing tests:**
  - Schema: a layout item `{type:"teamKb", scope:{teamId:"devrel"}}` parses. An old item without `scope` parses. An unknown key in `scope` is rejected.
  - Bridge state: `configure("w1", {teamId:"t"})` updates only that widget in the draft, and `saveEdit` persists it.
  - Widget:
    - no scope → the Pick copy is shown, and the widget reports empty when not editing;
    - edit mode → the team select lists the teams, and choosing one calls `onScopeChange({teamId})`;
    - digest 404 → the NoKb copy is shown;
    - a digest with 2 questions and 1 decision → two groups with 3 Rows; each row's href is `/knowledge/vault?source=team%3Adevrel&note=<encoded>`; the header count is 3 and the aside is the team name.
- [ ] **Step 2:** Confirm FAIL, then implement, then confirm PASS.
  - Run the bridge, teams and contracts system tests.
  - `tsc` for apps/web is clean.
  - The `WIDGETS` record is exhaustive, so `tsc` forces the registry entry.
- [ ] **Step 3: Commit:** `feat(web): team-scoped Bridge widget — team knowledge (open questions and agreements)`.
