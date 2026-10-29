---
title: Install external skills from private repositories
type: feature
status: idea
created: 2026-10-29
---

# External skills — private repositories

## Goal

Extend external-skill installation (paste a repo link → pick skills → installed read-only into the skill library, weekly auto-update pinned by SHA) to **private repositories**, starting with the company repo `https://github.com/shoptet/skills`.

## Starting point

- The first version supports public repos only (decided 2026-10-29).
- Install, update and "sync all" all fetch from the remote — every one of them needs auth for a private repo, including the weekly system automation that updates external dependencies.

## Open questions

- Auth source: reuse the operator's `gh` login / git credential helper vs. a token stored by ZIBBY (credential entry is a "Never" action — the operator has to set it up, not ZIBBY).
- Hosts: GitHub only, or also GitLab (team.blue group)?
- Failure mode: what the skill card shows when auth expires (update check fails, installed version keeps working).
