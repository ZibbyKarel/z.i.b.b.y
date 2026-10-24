# Proposals Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automations' suggestions become structured proposal records, with provenance, confidence and expiry. The operator dismisses or edits them in a Bridge "Návrhy" widget, and the producers respect those decisions on their next run.

**Architecture:**

- **API:**
  - a `proposals` resource: contract in `libs/contracts/src/proposals/`, Nest module `apps/api/src/proposals/` with a JSON store and a `ProposalsService`;
  - `pattern-extract`, `gap-detect` and `agent-factory` call `ProposalsService.upsert`, and the first two also read decisions when writing their notes;
  - dismissing an agent-factory proposal goes through the existing approval reject path.
- **Web:** a `features/proposals` query and mutation, plus a Bridge widget `proposals`.

**Tech Stack:** Zod 4, ts-rest, NestJS, Next.js 15, TanStack Query, next-intl, DS.

**Spec:** `docs/superpowers/specs/todo-14.md` is binding. Exact enums, copy, the confidence rule and the 30-day expiry are there.

## Global Constraints

- Never edit `.zibby/data/` by hand. Tests use a temp data dir. The exception is the regenerated `.zibby/data/vault/knowledge/self-knowledge.md` when the pre-commit gate demands it: run `graphify update .`, then `pnpm self-knowledge:generate`, stage it and retry. If docs-sync names a doc, update it.
- pnpm only. No `any`. No `forwardRef`. No inline `style` on DOM in `apps/web`. Every string goes through next-intl in cs and en.
- Run prettier and eslint on changed files and the related tests only. Run `tsc` per touched project and check the exit code.
- Never use `--no-verify`. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Existing producer behaviour and their notes' format stay the same, except for the decision filter. The existing producer tests must keep passing.

## Review Focus

- Dismiss a proposal, then rerun its producer with the same evidence. It stays dismissed and does not reappear in the vault note. (Task 1 test.)
- Edit a proposal, then rerun. The note line carries the edited text, and `text` is updated to the producer's new wording while `editedText` survives. (Task 1 test.)
- Dismiss an agent-factory proposal whose approval is still pending. The approval ends rejected, exactly as when the operator rejects it on the approvals page, and the candidate agent is handled the same way. (Task 1 test.)
- A corrupt `proposals.json` lists as `[]` with status 200, and the producers still write their notes. (Task 1 test.)
- In the widget, an edit save error shows inline and keeps the editor open with the typed text. (Task 2 test.)

---

### Task 1: API — proposals store, service, producers

**Files:**

- Create:
  - `libs/contracts/src/proposals/proposal.schema.ts` and `proposals.contract.ts` (+ contract test).
  - Export them and register them in `app.contract.ts` / `index.ts`. `project-health` and `inventory` are recent examples.
- Create:
  - `apps/api/src/proposals/proposals.store.ts` (+ test);
  - `proposals.service.ts` (+ test);
  - `proposals.controller.ts`;
  - `proposals.module.ts`, exporting `ProposalsService` and registered in `app.module.ts`;
  - an e2e test following `apps/api/test/*.e2e.test.ts`.
  - The data dir follows how other stores resolve `ZIBBY_DATA_DIR`. `apps/api/src/roadmap/routing-proposal.store.ts` is a close sibling.
- Modify:
  - `apps/api/src/patterns/pattern-extractor.service.ts`, `apps/api/src/gaps/gap-detector.service.ts` and `apps/api/src/agent-factory/agent-factory.service.ts`, plus their modules (import `ProposalsModule`) and tests.
  - Watch for DI cycles. If one appears, use `ModuleRef`, not `forwardRef` (repo convention).
- Modify: the activity kind enum, adding `proposal-decided`, plus every exhaustive map `tsc` flags, web included.
- Docs: `docs/api/proposals.md`.

**Interfaces (produced):**

- types `Proposal`, `ProposalSource`, `ProposalConfidence`, `ProposalStatus`, `DecideProposalInput`;
- `proposalsContract.listProposals` (GET) and `proposalsContract.decideProposal` (PATCH `/:id`);
- `ProposalsService.upsert(input: { source; key: string; text; occurrences; minOccurrences: number; provenance; now?: Date }): Promise<Proposal>`;
- `ProposalsService.decisions(source): Promise<Map<string /*id*/, Proposal>>`, or an equivalent helper the producers use to filter and rewrite;
- `proposalId(source, key): string`, exported and pure.

- [ ] **Step 1: Failing tests.**
  - **Store and service:**
    - The id is stable for the same source and key.
    - Confidence buckets with `m = 3`: 3 is low, 6 is medium, 7 is high.
    - Expiry is `lastSeenAt` plus 30 days. An expired proposal is not listed but is kept.
    - Upsert preserves `status`, `editedText` and `decidedAt`.
    - List order is confidence high first, then `lastSeenAt` descending.
    - Decide edit trims the text, validates 1–500 characters and sets `decidedAt`.
    - Decide on an agent-factory edit returns 409. Any decide on a dismissed proposal returns 409. An unknown id returns 404.
    - Decide records the activity entry.
    - A corrupt file reads as `[]`.
  - **Producers:**
    - The pattern and gap runs upsert proposals.
    - A dismissed proposal is omitted from the note on rerun.
    - An edited proposal is written with `editedText`.
    - The agent-factory run upserts with `agentId` and `approvalId`.
    - Dismissing an agent-factory proposal rejects the pending approval through the existing service. Find how the approvals page rejects (`useRejectMutation` on the web side, then the API reject route and service) and call that service method.
  - **e2e:** list returns 200; patch returns 200, 404 and 409.
- [ ] **Step 2:** Run the tests and confirm they FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Confirm the tests PASS, including the existing patterns, gaps and agent-factory tests. `tsc` must be clean for apps/api, libs/contracts and apps/web, the last because of the activity enum.
- [ ] **Step 5:** Commit `feat(api): structured proposals — provenance, confidence, expiry; dismiss/edit respected by producers`.

### Task 2: Web — Bridge widget `proposals`

**Files:**

- Modify:
  - `libs/contracts/src/system/system.schema.ts`: add `"proposals"` to the `BridgeWidgetSchema` type enum (exhaustive registry, as in the item-12 precedent).
  - `apps/web/features/bridge/widgets/registry.tsx`: add the entry.
- Create:
  - `apps/web/features/proposals/queries/useProposalsQuery.ts` (+ `getProposalsQueryKey`, index);
  - `mutations/useDecideProposalMutation.ts`, which invalidates and uses `meta.inlineError`.
- Create: `apps/web/features/bridge/widgets/ProposalsWidget.tsx` (+ test). Use `useWidgetReport`, and follow `TodoWidget` / `TeamKbWidget`.
- Use `export enum ProposalsWidgetTestId { Row = "proposals-widget-row", Source = "proposals-widget-source", Confidence = "proposals-widget-confidence", Expiry = "proposals-widget-expiry", Provenance = "proposals-widget-provenance", Dismiss = "proposals-widget-dismiss", Edit = "proposals-widget-edit", Editor = "proposals-widget-editor", Save = "proposals-widget-save", Cancel = "proposals-widget-cancel", RowError = "proposals-widget-row-error", Empty = "proposals-widget-empty" }`.
- Activity SSE: if `runEvents.tsx` maps activity kinds to query invalidations, map `proposal-decided` and the three producers' completion kinds to the proposals query key.
- i18n cs/en: `bridge.widget.proposals.*` with the spec's exact copy.

- [ ] **Step 1: Failing tests.**
  - Rows render `editedText ?? text`, the source label copy, the confidence copy, and the expiry in days for a fixed "now".
  - The provenance href is right for noteId, agentId and approvalId.
  - Dismiss calls the mutation with `{ params: { id }, body: { action: "dismiss" } }`.
  - There is no Edit button on an agent-factory row.
  - The Edit flow: the editor opens prefilled. Save is disabled while the text is empty or unchanged. Save calls `{ action: "edit", text }`. Cancel restores the row.
  - A save error shows `RowError` and keeps the editor open with the typed text.
  - An empty list shows the empty copy and reports empty. The count equals the number of rows.
  - Schema: a `{ type: "proposals" }` widget parses.
- [ ] **Step 2:** Confirm the tests FAIL, implement, then confirm they PASS. `tsc -p apps/web/tsconfig.json --noEmit` exits 0.
- [ ] **Step 3:** Commit `feat(web): Bridge widget Návrhy — review, dismiss or edit automation proposals`.
