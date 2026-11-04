# TODO 48 — PR widget: per-PR ownership inside stacks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the dashboard PRs widget, a PR inside a stack whose ownership differs from the stack's section is visibly marked, so a colleague's PR stacked on mine no longer reads as "mine".

**Architecture:** `PrRowVm` gains `mine: boolean` computed per PR from `pr.bucket === "mine"` (the API sets that bucket from `author:@me`, per PR). The stack grouping and section placement stay as-is (stack = one unit, section = root's bucket). `PrsWidget` renders a hairline `BoardTag` (`variant="source"`) in the meta line whenever `r.mine !== (g.section === "mine")`: "Cizí"/"Not mine" for others' PRs in the Mine section, "Moje"/"Mine" for own PRs in a review section. The conversations badge already keys on per-PR `bucket` — pinned by a stacked test.

**Tech Stack:** React 19, next-intl, Vitest + Testing Library, `@zibby/design-system` (`BoardTag`).

**Spec:** `docs/superpowers/specs/todo-48.md`

## Global Constraints

- No new DS component; reuse `BoardTag`. No inline `style`.
- UI strings in both `apps/web/i18n/messages/cs.json` and `en.json` under `bridge.widgets.prs.owner.{mine,other}`: cs `"Moje"` / `"Cizí"`, en `"Mine"` / `"Not mine"`.
- Ownership is per PR (`bucket === "mine"`), never inherited from the stack root.

## Review Focus

- Colleague PR stacked between two own PRs (master <- mine <- colleague <- mine): only the colleague row is tagged; the own kid is not. (Task 1 widget test.)
- Own PR stacked on a colleague's PR in a review section: tagged "Moje". (Task 1 rows test covers `mine`; widget rule is symmetric.)
- Conversations badge on a colleague kid in the Mine section with `unresolvedThreads` set: no badge. (Task 1 widget test.)
- A root row never gets a tag (root defines the section). Implied by the rule; covered by the stack test asserting tag count 1.

---

### Task 1: per-PR ownership flag + tag

**Files:**

- Modify: `apps/web/features/bridge/state/rows.ts` (`PrRowVm`, `prRow`)
- Modify: `apps/web/features/bridge/widgets/PrsWidget.tsx` (`card`)
- Modify: `apps/web/i18n/messages/cs.json`, `apps/web/i18n/messages/en.json`
- Test: `apps/web/features/bridge/state/rows.test.ts`, `apps/web/features/bridge/widgets/widgets.test.tsx`

**Interfaces:**

- Produces: `PrRowVm.mine: boolean` (`pr.bucket === "mine"`).

- [ ] **Step 1: Failing tests**
  - rows.test.ts `"prRow mine follows each PR's own bucket, not the stack root"`: stack `#1 mine (a<-main)`, `#2 to-review author jana (b<-a)`, `#3 mine (c<-b)` → `groups[0].section === "mine"`, `[root, ...kids].map(r => r.mine)` equals `[true, false, true]`.
  - widgets.test.tsx `"marks a colleague's PR inside my stack as not mine, without the conversations badge"`: same stack, colleague `#2` with `unresolvedThreads: 3`; one `BoardTagTestId.Root`, text `"Cizí"`, inside the `PR 2` button; no `IconBadgeTestId.Root` in the document.
- [ ] **Step 2: Run** `pnpm exec vitest run apps/web/features/bridge --project web-components` and the rows test (`--project web`) — expect FAIL.
- [ ] **Step 3: Implement** the flag, the tag rule (`card(r, sectionMine)`), and the i18n keys.
- [ ] **Step 4: Run** all `apps/web/features/bridge` tests — PASS.
- [ ] **Step 5: Commit**
