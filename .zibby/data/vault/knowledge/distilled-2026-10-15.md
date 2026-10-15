---
distilledAt: '2026-10-15T01:00:21.641Z'
runs: 18
learnings: 5
title: Destilace paměti — 2026-10-15
tags:
  - no-op
  - patch
  - pnpm
  - repo-scope
  - routing
  - shoptet-partner-cli
  - verify
  - workflows
updated: '2026-10-15'
---
Poznatky destilované z dokončených běhů (2026-10-15).

## Route tasks to the repo they actually target

Workflow routing can pick a repo that has no surface for the task. The shoptet-partner-cli repo contains only a README and no package.json, frontend, or Docusaurus code, so Developers' Portal and cms4 tasks do not belong there. When the router's confidence is low, check that the target repo contains the files the task touches before running code or verify phases.

## Do not stub a repo just to satisfy a verify step

When a task's target is absent from the checked-out repo, the right outcome is a reported no-op or BLOCKED result with the evidence. Writing a package.json or stub component only so a pnpm verify step passes produces an unrelated change in the wrong repo. A missing package.json causing ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND is a symptom of the mismatch, not a defect to fix.

## Review phases should verify claims against the worktree

Reviewers in the patch pipeline re-check the worktree directly (git log, git status, ls) instead of trusting the implementer's report. When a repeated retry reaches the same conclusion from fresh evidence, the review can approve the non-actionable outcome. This is the expected way to close out a mismatched task.

## KB wiki layout and source-citation convention

The devrel knowledgebase keeps raw source files under raw/ (dated slugs), meeting transcripts as meetings/*.vtt, synthesized notes under wiki/notes/, and project pages under wiki/projects/. Each compiled note cites its raw or meeting source, and project pages link to new notes from their Outputs section. Ingest should follow this layout.

## KB notes are written in Czech

Knowledgebase ingest output (wiki notes, summaries, and project pages) is written in Czech, matching the source meetings and raw documents. Keep that language when adding or updating KB notes.
