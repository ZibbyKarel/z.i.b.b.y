# Phase 128 — Company-level integrations

## Why

One company often has one tracker for several projects. Example: Shoptet runs a single
Jira for `shoptet-partner-cli` and `cms4`. Today integration ownership exists for companies
(`companyId` XOR `projectId`, Phase 68/70/72), but the rest is still project-shaped:

- roadmap sync is per project and takes the *first* `jira`/`github` from the resolved list;
- triage attributes an item to `integration.projectId`, and company-owned items fall back to
  text guessing (`project-matcher`);
- `autoSync` / `autoPlay` live only in `roadmap/<projectId>/_config.json`;
- level mapping is one global table (`roadmap/_level-mapping.json`).

## Decisions (grill session 2026-10-15)

| # | Decision |
|---|----------|
| D1 | Company owns the integration by default; a project may override it. Override = a project-owned integration of the same kind (existing XOR + `mergeIntegrationsByKind`). No field-level merging. |
| D2 | `Company` stays the entity it is. `companyId` on a project stays optional; projects without a company own their integrations directly. No implicit "Personal" company. |
| D3 | Each project carries **routing rules** per company integration: `integrationRouting: [{ integrationId, match }]` in `_projects.json`. `match` by kind — Jira: `projectKey` + optional `components` / `labels`, or raw `jql`; GitHub: implicit from the project's `gitRemote` (no config); Slack: `channels`. |
| D4 | An item matching **two or more** projects goes to triage (notify-only). Never first-match. |
| D5 | "Mine and mentions" ceiling is unchanged. Company-level only shares the connection and credentials; routing filters within what the adapter already ingests. |
| D6 | Credentials stay per integration in `.zibby/data/credentials/`, outside vault and git. |
| D7 | Roadmap sync runs **per integration**: fetch once, distribute items to projects by routing rules. Items with no matching project are not imported; they are counted as `skipped` with a note. Item ids (`roadmapItemIdForSource`) are unchanged. The auto-sync tick iterates integrations. |
| D8 | `autoSync` and `autoPlay`: company sets defaults (`Company.roadmapDefaults`), project overrides. Project `_config.json` becomes tri-state: `true` / `false` / `null` (= inherit). A project without a company inherits the global defaults (`false`). A company default `autoPlay: true` does enable auto-pickup for inheriting projects (Tier-2: it opens PRs, merge stays the gate); the UI shows "inherited from company". |
| D9 | Level mapping: global default table stays; a company may override per `(kind, externalLevel)` (`Company.levelMapping`). No per-project override. |
| D10 | Triage attribution: for a company integration **with** routing rules configured, only the rules decide (0 or ≥2 matches → notify-only triage). For a company integration with **no** rules anywhere, the existing text matcher stays. |
| D11 | Migration: one-shot script with dry-run. Project-owned integrations of the same kind and same target (`baseUrl` for Jira) across projects of one company merge into one company-owned integration, with routing rules generated from each old config (`projectKey` / `jql`). Writes only after confirmation (`--apply`). Output is reviewable in git. |
| D12 | UI: company detail gets an **Integrations** tab (create/edit, level-mapping overrides, roadmap defaults). Project integrations tab shows inherited company integrations read-only with a "from company" badge + link, routing rule editor, "Override with own integration" action, and tri-state autoSync/autoPlay toggles. `/settings?tab=tasks` keeps only the global level-mapping table. |
| D13 | Scope: Jira + GitHub (sync + mapping) and Slack (routing). Email, calendar, Sentry unchanged. |

## Delivery (straight to `main`, no PRs)

1. **Contracts + data + migration** — `Company.roadmapDefaults`, `Company.levelMapping`,
   tri-state `RoadmapConfig`, `Project.integrationRouting`, pure resolvers
   (`resolveRoadmapConfig`, `composeLevelMapping`, `matchRouting`), migration script with
   dry-run.
2. **Backend** — per-integration sync with distribution, tick over integrations, triage
   routing, composed level mapping, effective config resolution.
3. **UI** — company Integrations tab, inherited integrations + routing + tri-state toggles on
   the project.
