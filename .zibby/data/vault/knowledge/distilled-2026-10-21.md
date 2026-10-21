---
distilledAt: '2026-10-21T01:00:36.285Z'
runs: 20
learnings: 4
title: Destilace paměti — 2026-10-21
tags:
  - mockery
  - partner-service-add
  - patch-pipeline
  - php
  - regression-risk
  - routing
  - testing
  - typeerror
updated: '2026-10-21'
---
Poznatky destilované z dokončených běhů (2026-10-21).

## remarketingHelpUrl needs a string cast in the PartnerServiceAddController constructor

In `createMarketingProps()`, `remarketingHelpUrl` is cast with `(string) (… ?: '')`. If `FrontEndHelper::getHelpTopicUrlByCode()` returns `false`, the constructor throws a TypeError, and every one of the eleven tabs returns HTTP 500. Keep the cast, and cover it with a test so a refactor cannot remove it silently.

## Each ported PartnerServiceAdd tab has its own *PropsTest on the testable controller harness

The ported tabs (codes, users, endpoints, screenshots, descriptions) each have a `*PropsTest` built on the `TestablePartnerServiceAddController` harness. New tab-prop logic should get the same kind of test. Stub static helpers such as `FrontEndHelper` with Mockery, or move the lookup behind an overridable method on the harness.

## Tasks for the Docusaurus portal or cms4 do not belong in shoptet-partner-cli

The shoptet-partner-cli repo holds only a README: no package.json, no lockfile, no Docusaurus config, and no frontend code. Tasks about the Developers' Portal Docusaurus theme, sidebar, feedback widget or cms4 ClassLoading/controllers have no place to land there. The patch pipeline keeps routing them to this repo and failing at verify with ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND. When a task does not match the checked-out repo, report it as blocked and do not add stub files to satisfy the pipeline.

## Homebrew openjdk@21 is keg-only on macOS

On macOS, Homebrew's openjdk@21 is keg-only, so `java` is not on PATH after install. Link it or set PATH and JAVA_HOME to the keg before running Java projects.
