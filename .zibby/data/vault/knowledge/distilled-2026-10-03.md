---
distilledAt: '2026-10-03T01:00:27.250Z'
runs: 19
learnings: 4
title: Destilace paměti — 2026-10-03
tags:
  - approvals
  - confidence-scoring
  - context-loss
  - error-classification
  - handoff
  - no-op-approval
  - pnpm
  - repo-scope
  - shoptet
  - shoptet-partner-cli
  - task-routing
  - ui
  - verification
  - verify-phase
---
Poznatky destilované z dokončených běhů (2026-10-03).

## shoptet-partner-cli is a minimal CLI repository

shoptet-partner-cli contains only README.md and .git — no package.json, no Docusaurus config, no frontend/theme/component code, no PHP source. It is a Node/oclif CLI toolchain for Shoptet partner addon scaffolding, not a docs portal or UI surface. Tasks requiring Docusaurus or theme changes have no attachment point here.

## Task/repo mismatch detection via repeated phase verification

When a task is routed to the wrong repository, multiple independent phases (code, review, verify) reach the same no-op conclusion consistently across retries, even with different diagnostics. Router flags low confidence (≤0.22) in such mismatches. This pattern holds across attempts — no fabricated evidence, consistent chain — making it a reliable signal for approval as no-op rather than evidence of a bug to fix.

## pnpm ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND is expected, not a defect

When package.json is absent, verify phase fails with ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND. This is an expected side effect of the repo lacking a Node project surface, not a new error to fix. Creating a stub package.json solely to satisfy the verify phase would produce an unrelated PR in the wrong repository.

## Approval queue handoffs lack task context

Approval items show only status like "qa wants to handoff" without task details, who is affected, or source run. This causes ambiguity when 100+ approvals queue up — operator cannot distinguish whether items are duplicates, what each requires, or whether they are actionable without opening the UI. Handoff messages should include task/run ID and actionable summary.
