---
distilledAt: '2026-10-05T01:00:32.972Z'
runs: 16
learnings: 3
title: Destilace paměti — 2026-10-05
tags:
  - delivery-pipeline
  - developers-portal
  - low-confidence
  - no-rework
  - routing
  - scope
  - scope-validation
  - shoptet-partner-cli
  - task-assignment
---
Poznatky destilované z dokončených běhů (2026-10-05).

## shoptet-partner-cli is CLI toolchain only, not UI/docs repository

shoptet-partner-cli is a Node/oclif-based CLI for Shoptet partner addon scaffolding. It contains no Docusaurus configuration, no frontend components, no component library, no package.json, and no UI surface. Tasks requesting changes to the Developers' Portal UI, Docusaurus theme, sidebar components, or feedback widgets consistently route here with low confidence (0.22) despite having no attachment point in this repo.

## Cross-repo task routing defaults low-confidence tasks without validation

Multiple patch workflows show the router defaulting tasks to shoptet-partner-cli at low confidence (0.22) without first validating that the repository actually contains the relevant code surface. Tasks about Docusaurus, portal UI, and frontend components land here and must be explicitly rejected as out-of-scope. Router should validate task scope against repository capabilities before attempt.

## Delivery pipeline completes Kodér → Code-Review → Tester → Dokumentátor without rework

End-to-end delivery cycles can complete without rework when the task is well-scoped to the correct repository. The Dokumentátor phase successfully finalizes delivery after Tester validation passes.
