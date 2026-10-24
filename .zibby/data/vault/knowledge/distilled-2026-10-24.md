---
distilledAt: '2026-10-24T01:00:19.906Z'
runs: 20
learnings: 9
title: Destilace paměti — 2026-10-24
tags:
  - accessibility
  - approval-gate
  - attribution
  - design-system
  - focus
  - invariant
  - law-1
  - wcag-2-2
updated: '2026-10-24'
---
Poznatky destilované z dokončených běhů (2026-10-24).

## Attribution-only fields must never feed the approval gate

Fields used only for attribution, such as a department tag on a run, are read by no gate-evaluation logic. The approval floor (Law 1) depends on this: gating decisions come only from policy inputs, so changing an attribution label cannot weaken or bypass approval.

## Interactive controls keep a visible keyboard focus indicator

Never remove a focusable element's outline without a replacement. Navigation surfaces such as SVG graph nodes and custom controls should reuse the existing selected/focus ring pattern. The project audits against WCAG 2.2 AA, and missing focus indication is treated as a merge blocker.

## ProjectProfile is a separate schema from Project

ProjectProfileSchema (mission, autonomyPolicy, people) is deliberately kept apart from ProjectSchema so profile writes cannot pass through the unvalidated project PATCH path. autonomyPolicy.canDoAlone has no effect on the gate yet.

## Chat-created tasks are classified; only explicit targets skip classification

Tasks created through the chat MCP create_task call TaskSchedulerService.createTask without an explicitTarget, so the classifier picks the target the same way the New Task dialog does. Only explicitTarget paths (goal dispatch, approved proposed tasks, loop-scheduled tasks) bypass the classifier.

## Delivery pipeline stage order

The delivery pipeline runs Architekt (plan), then Kodér (implementation), Code-Review, Tester or Test-Automator, and Dokumentátor. Each stage writes its artifact into a numbered directory (01_architekt, 02_koder, and so on). A rejecting review returns work to an earlier stage rather than passing it on.

## Code-audit lens order and verdict vocabulary

The code-audit pipeline runs quality, then security, then accessibility, then performance, and a report stage synthesizes one verdict (PASS, CONDITIONAL PASS, or BLOCK) with a severity table per lens. Accessibility is audited against WCAG 2.2 AA. A Critical accessibility finding blocks merge, while findings in other lenses are usually fast-follow items.

## Pipeline stage sandboxes are numbered per dispatch

Stage directories are numbered sequentially within a single dispatch (01_, 02_, and so on), which keeps stage artifacts ordered and traceable. Stage-run records carry an optional dir field that holds the directory name.

## Next.js 16 middleware file is src/proxy.ts

In kzphoto (Next.js 16) the former src/middleware.ts is now src/proxy.ts. next-intl's createMiddleware still backs it and the behavior is unchanged. Docs and references should point to proxy.ts.

## UI-polled endpoints should not scale with total run history

A status or feed endpoint polled by the UI should not do work proportional to the entire run history when nothing has changed. Doing so adds steady server load that grows as history accumulates. Scope such queries to recent or changed items.
