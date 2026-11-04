# Approval card opens detail + output button — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the run sheet, the approval card drops the phase-output preview, the whole card opens the approval detail, and its "Open detail" button becomes an "open output" button.

**Architecture:** Pure web change. `RunApprovalBanner` (apps/web/features/runs/components/RunFeedBanners.tsx) becomes an interactive `Card` whose click calls `onOpenDetail` (wired by `RunDetail` to `RunSheet.openApproval`, so item 45's close-together behaviour holds); the title is a `Pressable` for keyboard users (PrRow pattern). The action column, revise form and reject dialog sit in a `stopPropagation` click zone. The output button reuses `useRunArtifacts(run)[0]` (PR → link in new tab, phase artifact → existing `POST /tasks/runs/:runId/open-folder { artifact }`, else run folder → same endpoint, Finder). No API/contract change — the open-folder endpoint already validates the artifact name (`OPENABLE_ARTIFACT`) and resolves paths server-side.

**Tech Stack:** React 19, next-intl, vitest + Testing Library.

**Spec:** docs/superpowers/specs/todo-47.md

## Global Constraints

- UI strings via next-intl in both `cs.json` and `en.json`; reuse `runs.artifacts.{openPr,openFile,openFolder}`.
- No inline `style`, no `any`, compose from DS (`Card interactive`, `Pressable`, `Container onClick`).
- Card click must go through `RunSheet`'s `openApproval` wrapper.

## Review Focus

- Clicking Hold / Revise / Reject / the reject dialog / the revise textarea must not open the detail (stopPropagation zone) — tested in Task 1.
- Clicking the output button must not open the detail — tested in Task 1.
- Run with no artifact (agent run, no PR) → no output button, card still opens detail — tested in Task 1.
- Card outside the sheet (run page, no `onOpenDetail`) is not interactive — tested in Task 1.

---

### Task 1: Approval card — card click opens detail, output button, no phase output

**Files:**

- Modify: `apps/web/features/runs/components/RunFeedBanners.tsx` (RunApprovalBanner)
- Modify: `apps/web/features/runs/components/RunDetail.tsx` (pass `output`, drop `children`)
- Modify: `apps/web/features/bridge/components/sheets/RunSheet.tsx` (drop checkpoint block)
- Modify: `apps/web/i18n/messages/{cs,en}.json` (remove `runs.detail.banner.openDetail`, `bridge.sheet.run.output` if unused)
- Test: `RunFeedBanners.test.tsx`, `RunSheet.test.tsx`

**Interfaces:**

- `RunApprovalBannerProps`: remove `children`; add `output?: RunArtifact` (from `../useRunArtifacts`); `onOpenDetail?: () => void` now makes the card interactive.
- New test ids: `RunFeedBannersTestId.Output = "run-banner-output"`, `RunFeedBannersTestId.Title = "run-banner-title"`.
- `RunDetailProps.children` removed.

- [ ] Step 1: tests in RunFeedBanners.test.tsx — clicking the card (Approval test id) calls `onOpenDetail`; clicking Reject / Revise does not; output PR → `window.open(href, "_blank", "noopener,noreferrer")` and no `onOpenDetail`; output file → its `open()` called, label "Open {name}"; no `output` → no Output test id; RunSheet test asserts no "Audit report".
- [ ] Step 2: run them — FAIL.
- [ ] Step 3: implement.
- [ ] Step 4: run — PASS; run all `apps/web/features/bridge` + `features/runs` tests.
- [ ] Step 5: commit.
