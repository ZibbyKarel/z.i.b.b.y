---
distilledAt: '2026-10-04T01:00:30.083Z'
runs: 15
learnings: 3
title: Destilace paměti — 2026-10-04
type: pattern
tags:
  - artefact-enrichment
  - documentation
  - error-interpretation
  - false-positives
  - no-op-handling
  - router-signals
  - routing
  - task-matching
  - test-feedback
  - verification
---
Poznatky destilované z dokončených běhů (2026-10-04).

## Task/repo mismatch is non-actionable, not a bug to fix

When a task targets a feature with no surface in the checked-out repo (e.g., Docusaurus components in a CLI-only repo, PHP deletions in the wrong upstream), the correct action is to mark it non-actionable and skip the work. Router flagging low confidence (<0.3) is a signal. Creating synthetic code structure or stubs just to satisfy automated verification phases is the actual defect, not the no-op decision itself. This pattern recurred across three independent review phases with identical conclusions.

## Verify phase failures from legitimate no-ops are not new bugs

When verification phases fail due to expected structural differences (e.g., `ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND` in a non-Node repo), treat this as confirmation of task/repo mismatch, not as a new error to debug or fix. The failure is a mechanistic consequence of correct no-op reasoning, not a defect in the code or a new path to fix.

## Dokumentátor enriches docs with test-phase discoveries, not just codifies existing content

The Documentation phase receives findings from the Tester phase (e.g., environment configuration, JDK setup notes discovered during validation) and incorporates them into final artifacts. Dokumentátor's role is to capture context that emerged during testing and would not be obvious from static code reading alone, making documentation actionable for future users.
