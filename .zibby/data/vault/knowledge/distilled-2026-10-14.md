---
distilledAt: '2026-10-14T01:00:41.030Z'
runs: 21
learnings: 6
title: Destilace paměti — 2026-10-14
tags:
  - cms4
  - incident-response
  - patch-workflow
  - pr-review
  - repo-mismatch
  - routing
  - triage
  - verification
updated: '2026-10-14'
---
Poznatky destilované z dokončených běhů (2026-10-14).

## Confirm the target repo contains the referenced surface before patching

Several patch and quick-fix runs failed because the task referred to Developers' Portal Docusaurus UI or shoptet/cms4 PHP code, but the checked-out repo (shoptet-partner-cli) held only README.md, with no package.json and no frontend. The agents correctly refused to write a package.json or stub component just to satisfy the verify step. Why: a fabricated change would be an unrelated PR in the wrong repo. How to apply: before editing, check that the files or components named in the task exist in the checked-out repo. If they don't, stop and report the mismatch instead of forcing a change.

## Triage reports without a symptom instead of guessing a fix

Incident-responder and devops-incident-responder runs received PR descriptions or truncated messages with no symptom, reproduction steps, error message, or CI link. The agents declined to fix anything and asked for those details, and offered to review the PR only if explicitly tasked. Why: a fix without a reproducible symptom is a guess. How to apply: require a concrete symptom (URL, expected vs actual behavior, error text, or CI run) before attempting a fix. Treat a plain PR description as a review request, and only proceed if the user asks for one.

## cms4 code is a separate checkout, not part of z.i.b.b.y

The shoptet/cms4 repository (PHP and React, including the partner-service and addon-statistics PRs) is checked out at ~/Workspace/cms4. The z.i.b.b.y repo contains only a configuration file, integrations/shoptet-github-cms4.json, for that integration. Fixes and PR branch work for cms4 belong in the ~/Workspace/cms4 checkout on the PR's branch. Why: running agents from z.i.b.b.y cannot see cms4 code.

## Homebrew openjdk@21 is keg-only on macOS

Homebrew's openjdk@21 formula is keg-only, so the java binary is not on PATH after installation and the JDK must be added explicitly (via PATH or JAVA_HOME). A tester hit this while running a Java hello-world app. Why: the install looks successful but java still fails. How to apply: document the PATH or JAVA_HOME setup in the project README, and check java -version when a Java run fails on macOS.

## Spending audits are advisory only and minimise personal data

Decision agreed for the spending audit and expense auditor workflow: it takes input files (bank statements, contracts, invoices) and produces proposals only. It extracts recurring payments and contract terms, and discards the rest of the statement's personal data. Its output is a ServiceProfile per service plus a list of unverified fields, and that output needs human confirmation before any downstream step. Reports must never cancel, order, or change anything. Why: bank statements contain a lot of personal data, and the recommendations drive later decisions. How to apply: keep these audits read-only, keep only the necessary fields, and gate downstream steps on approval.

## ZIBBY team records have no member roster

ZIBBY's team entities store only id, name, company, and knowledge base. They do not store the member list or a member count. To count members, query the team's Slack channel with slack_list_channel_members. Why: asking ZIBBY for a headcount from team data returns no answer. How to apply: go to Slack for membership questions and ask the user for the channel name if it is not known.
