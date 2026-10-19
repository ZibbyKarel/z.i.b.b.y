---
distilledAt: '2026-10-17T01:00:22.722Z'
runs: 29
learnings: 11
title: Destilace paměti — 2026-10-17
tags:
  - approval-gate
  - attribution
  - chat
  - classifier
  - contracts
  - dispatch
  - invariants
  - task-scheduler
updated: '2026-10-17'
---
Poznatky destilované z dokončených běhů (2026-10-17).

## Attribution-only metadata must never feed the approval gate

Fields that exist only for attribution (for example a department tag on a run or task) must not be read by the gate-evaluation engine. The approval floor (Law 1) has to hold regardless of organisational metadata, so gate logic depends only on the policy inputs.

## Chat-created tasks are classified; only explicit targets skip classification

Tasks created through the chat MCP go through TaskSchedulerService.createTask with no explicitTarget, so the classifier chooses the target, the same as the New Task dialog. Only paths that pass an explicitTarget bypass classification: goal dispatch, approved proposed tasks, and loop-scheduled tasks.

## Project profile schema kept separate from the project schema

ProjectProfileSchema is deliberately kept apart from ProjectSchema so that profile writes cannot slip through an unvalidated PATCH on the project schema. Validate profile data through its own contract.

## Custom interactive graphics need a visible keyboard focus indicator

Clickable SVG or custom-drawn nodes that strip the browser focus outline without a replacement make the feature unusable for keyboard-only users, which is a WCAG 2.2 AA failure on primary navigation. Reuse the existing selected-ring style as the focus indicator. Independent audit passes repeatedly flag this.

## Endpoints that scan total run history scale with history, not with change

Server endpoints that recompute over the full run history on every poll cost more as history grows, even when nothing has changed. Bound them with pagination, a cursor, or caching rather than rescanning everything.

## Reviewers re-run quality gates instead of trusting handoff claims

Code-review stages should verify typecheck, tests, and lint themselves rather than accept the previous stage's reported results. A verdict is only as good as the gates it was checked against.

## Docs stage drafts CLAUDE.md changes for the operator instead of editing them

Documentation runs should not edit CLAUDE.md directly. Conventionally the operator reviews those edits, so the stage drafts the proposed content for easy adoption and leaves the file for review.

## Outward-facing actions go through approval; autonomous work does not

Agents may run work autonomously, but anything with outward or visible effect (push, PR, file deletion, rename) must pass the approval gate. The operator keeps the final say on those actions.

## Standard pipeline stage sequences and numbered stage directories

The delivery pipeline runs Architekt, then Kodér, Code-Review, Tester (Test-Automator), and Dokumentátor. The code-audit pipeline runs quality, security, accessibility, performance, then report. Each stage writes into a numbered directory (for example 01_architekt, 02_koder), and the directory number is assigned sequentially per dispatch.

## Operator converses with ZIBBY in Czech

The operator writes to ZIBBY in Czech, so replies should default to Czech unless the operator switches languages.

## Next.js 16 renamed middleware.ts to proxy.ts

In Next.js 16 the middleware file is named src/proxy.ts and not src/middleware.ts. Behaviour is unchanged, and next-intl's createMiddleware still backs it. Update references to the new name.
