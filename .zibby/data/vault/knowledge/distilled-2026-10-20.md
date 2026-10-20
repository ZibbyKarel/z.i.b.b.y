---
distilledAt: '2026-10-20T01:00:18.007Z'
runs: 25
learnings: 8
title: Destilace paměti — 2026-10-20
tags:
  - cms4
  - locale
  - phpunit
  - repo-scope
  - routing
  - shoptet-partner-cli
  - test-isolation
  - workflows
updated: '2026-10-20'
---
Poznatky destilované z dokončených běhů (2026-10-20).

## Route tasks to the repo that owns the surface; block on mismatch

shoptet-partner-cli is a Node/oclif CLI toolchain for Shoptet partner addon scaffolding. Its tree is only a README. Work on cms4 (PHP controllers, templates, ClassLoading) or the Developers' Portal Docusaurus theme does not belong there. When a patch or quick-fix phase finds no matching surface, the correct outcome is to report BLOCKED with the mismatch. Do not add a stub package.json or component to satisfy a downstream verify step. An ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND failure in that case is a symptom of the wrong repo, not a defect to fix. Repeated identical BLOCKED diagnoses across phases should escalate, not be retried.

## cms4 tests leak locale and translation state

BootstrapLocaleTest loads translations and never unloads them. Its locale helper only restores the locale itself. LanguageChangeSubscriberTest switches locale via Localization::pretendFrontend without restoring it. Tests that assert on translated strings can therefore fail depending on run order. Either fix the teardown in these classes or force the plain C locale in each affected test class. Forcing C once for the whole unit suite is the broader alternative.

## Share test setup and mocks instead of copying them

In cms4, the same 15-line locale setup and teardown block was copied into 19 test classes. The established pattern is a trait in tests/src/, as StubProjectProvider does. In admin-web, mock components were copied almost unchanged across test files. Shared helpers are the house pattern, as already used for PageForm. Copy-pasted test scaffolding should be moved into a shared helper or trait.

## Vitest restoreMocks timing in admin-web

On Vitest 4.1.12, restoreMocks runs before each test, not after. Spies left by one test file are already restored before the next file loads. A per-file afterEach(vi.restoreAllMocks) is therefore redundant. Check this before flagging it as a leak. Earlier PR replies that claim restoreMocks runs after each test are wrong.

## Per-project docroot storage breaks cross-project URLs

Partner logo uploads are stored under the merchant project's DOCUMENT_ROOT (/user/partner-portal). The CRM-owned st_crm.partner.image column stores only the bare filename, and getPublicUrl returns a host-less path. Any consumer outside that project, such as the CRM admin or the public partner catalog, resolves the path against its own host and gets a broken image. The files also count against the merchant's quota and are lost when the project is deleted or transferred. Files referenced from shared data should be stored in shared storage or referenced by absolute URL, not as bare filenames under a per-project docroot.

## Code review scope: skip what is already raised or fixed

When reviewing a PR, leave out points that other reviewers already raised in the existing PR threads, and points the author has already fixed. Report only new findings. Check each finding against the current head before reporting it.

## Review PRs from a read-only clone, not the working tree

When the working directory is not a checkout of the repo under review, make a read-only sparse clone of the PR head in a temp directory. Do not fetch the PR into a local branch in the user's repo, because that leaves branches behind. Run scratch experiments on the library version the PR uses, so behaviour claims are verified against it.

## Test risky commands in a scratch dir, not a dirty repo

When verifying an approval or gate flow, use a throwaway file in a scratch directory and delete it afterwards. Do not run exploratory commands in a repo with uncommitted renames or edits, since a mistaken command could damage that work.
