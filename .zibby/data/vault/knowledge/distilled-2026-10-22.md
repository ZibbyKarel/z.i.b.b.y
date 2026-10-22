---
distilledAt: '2026-10-22T01:00:53.459Z'
runs: 18
learnings: 5
title: Destilace paměti — 2026-10-22
tags:
  - cms4
  - inertia
  - pnpm
  - repo-routing
  - shoptet
  - shoptet-partner-cli
  - verify
  - workflow
updated: '2026-10-22'
---
Poznatky destilované z dokončených běhů (2026-10-22).

## shoptet-partner-cli is not the home for cms4 or Developers' Portal work

shoptet-partner-cli is a Node/oclif CLI toolchain for Shoptet partner addon development. Its root holds only a README, with no package.json and no frontend code. Tasks that touch cms4 PHP (controllers, templates, class loading) or the Docusaurus-based Developers' Portal theme belong in their own repositories. Route them there instead of forcing a change into this repo.

## Don't stub package.json to satisfy a verify step

When a verify phase fails with ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND in a repo that has no package.json, the failure is a symptom of the wrong target repo, not a defect to fix. Writing a manifest or stub component just to turn verify green produces an unrelated PR. Report the mismatch and make no change instead.

## Inertia 409 responses must not carry X-Inertia

In cms4, add Inertia headers only after the layout-reload decision, so a 409 response does not include X-Inertia. The Inertia trait's header logic is private and calls header()/ajaxExit() directly, so there is no cheap seam for header unit tests.

## Shoptet PR rebases target origin/master

Shoptet cms4 PRs are rebased onto origin/master, not main. The usual sequence is to fetch the PR branch, check out its head detached, then rebase onto origin/master. Zibby repositories use main, so do not carry this default over.

## Homebrew openjdk@21 needs an explicit PATH on macOS

On macOS, Homebrew's openjdk@21 is keg-only and is not on PATH by default, so java can resolve to a missing or wrong JDK. Add the keg's bin directory to PATH, and note this in the project README when a Java app depends on it.
