---
distilledAt: '2026-10-27T02:00:24.417Z'
runs: 24
learnings: 10
title: Destilace paměti — 2026-10-27
tags:
  - email-integration
  - entra
  - git
  - imap
  - microsoft-365
  - oauth
  - rebase
  - squash-merge
updated: '2026-10-27'
---
Poznatky destilované z dokončených běhů (2026-10-27).

## Email integration supports only IMAP/SMTP with a password

The `email` integration knows only IMAP/SMTP with a password. It has no Microsoft sign-in window and no OAuth2 flow. Adding Microsoft 365 sign-in would need a new feature: an Entra app registration with a redirect URL to ZIBBY, Mail.Read/Mail.Send permissions, a refresh-token store, and XOAUTH2 or Microsoft Graph for reading mail. Tenant admin consent is usually the main blocker, and code cannot route around it.

## Rebase a PR onto master with --onto when its commits were already squash-merged

When a PR branch still carries commits that master already has as a squash commit, a plain `git rebase origin/master` conflicts on the first commit. Instead, run `git rebase --onto origin/master <last-unique-commit>` to drop the duplicated commits. Master's squash is the reviewed final form, so it wins over the branch copies. Confirm that the PR's own unique commits are still applied afterwards.

## Reply to each review thread with the fixing commit and resolve only what is fixed

When addressing PR review comments, reply to each thread with the commit that fixed it and resolve the thread. If a comment is deliberately deferred, leave the thread open and give the reason, such as that the change touches another area and belongs in a follow-up. Do not silently skip a comment. If you decline a suggestion, say so with the reason.

## Nullable docblocks and nullsafe calls must agree with the real type

PHPStan flags `?->` on a non-nullable type as `nullsafe.neverNull`. In the cms4 backend, `Backend\Controller::getPage()` returns a non-null `PageAdmin` from constructor injection. Remove the `?->` and keep the abstract `getPage()` docblock at `PageAdmin`, not `PageAdmin|null`. A stale nullable docblock invites the same error.

## PHPStan does not run locally; CI is the verifier

The PHPStan target hangs when run locally, so PHP static analysis is verified only in CI. Locally, run `php -l` on touched files as the minimum check. Expect the CI result, not a local run, to decide whether a PHPStan fix is correct.

## Tests that change superglobals must restore them in tearDown

Tests that set `$_GET` or other superglobals should restore them in `tearDown()`, for example by unsetting `$_GET`. Otherwise one test leaks state into the next. Add a case for each sort or filter parameter the controller reads.

## Shared UI components need their own tests that pin lazy mounting

Reviewers ask for a component test on any shared component that more than one tab or page uses, such as `LanguageTabs`. Such a test should pin three things: only the first panel mounts initially, a visited panel stays mounted after switching away, and the render callback gets the right language. Tab components that wrap a shared component also need a test for unsaved edits surviving a language switch.

## Empty-state text should match across listings

The partner-portal listings use one empty-state message, "Záznamy nebyly nalezeny...". Reviewers flag any listing that shows a different empty message, such as "Žádné položky". When removing a per-page `rows.length > 0` wrapper, check every other listing that still has it, and do not leave one behind by accident.

## Untranslated i18n keys fall back to English

A new message key added only to `en.json` shows its English text in the Czech UI until someone adds the `cs.json` entry. Add the Czech translation in the same change when possible, and call it out in the PR if it is missing.

## Workflow patch runs misroute tasks to shoptet-partner-cli

Several failed `patch` and `quick-fix` runs targeted tasks for cms4 (PHP), the Docusaurus Developers' Portal, and the admin-web frontend. Their checkout, `shoptet-partner-cli`, holds only a README and a Node/oclif CLI scaffold. Its `package.json` and lockfile are absent. The reviewers' decision was to report BLOCKED, not to add stub files just to satisfy the verify step. Before coding, check that the task's target repo has the surfaces the task names. Escalate a repo mismatch instead of fabricating changes.
