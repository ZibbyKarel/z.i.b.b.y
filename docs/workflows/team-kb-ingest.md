# team-kb-ingest

Compiles a team knowledge base's new raw sources into its wiki ("LLM wiki" pattern) and delivers the result as a branch + PR to the KB repo. Tier 2: the PR is opened, never merged; nothing touches the default branch (Law 3).

Files: `.zibby/data/workflows/team-kb-ingest.workflow.md`, agent `.zibby/data/agents/kb-librarian.md`.

## What it does

`scan` (find sources not yet in `_meta/log.md` / wiki `sources`) -> `meetings` (a `type: talk` meeting note per transcript, one sentence per topic, ~4-5 points per hour) -> `compile` (update/create evergreen wiki articles, one per concept, link instead of duplicate, split >1500 words; one line per page in `wiki/INDEX.md`; append to `_meta/log.md`; self-lint) -> `report` (PR body, always ending with a "left for the human to decide" section).

The KB's own `AGENTS.md` defines layout, templates, frontmatter and log format. The workflow follows it and never imposes one. Sources (`raw/`, the `.vtt` files) are never modified; `verified_by` is never set by the agent.

## Required setup (the runner targets a registered project, not a team)

A PR output pushes from, and opens against, the **run's project repo** (`project.path`, else its clone of `gitRemote`). The workflow has no team/KB-path parameter, and a team's `knowledgeBase` source is read-only by design. So the KB repo must be a registered project:

```json
{
  "id": "devrel-knowledgebase",
  "name": "DevRel Knowledge Base",
  "path": "/Users/zibar/Workspace/devrel-knowledgebase",
  "gitRemote": "git@github.com:shoptet/devrel-knowledgebase.git",
  "category": "Shoptet",
  "companyId": "shoptet",
  "teamId": "devrel"
}
```

(add via Projects UI or `POST /api/projects`). Optionally set `project: devrel-knowledgebase` in the workflow frontmatter so a run binds to it by default; it is left unset so the same workflow serves other teams' KB projects.

Prerequisites: the checkout is clean on its default branch (the KB currently has an uncommitted `_meta/log.md` change; the run branches from committed HEAD, so commit or stash it first or the log entry may conflict), `gh` is authenticated for `shoptet/devrel-knowledgebase`, and no verify command is needed (the workflow has no verify phase).

## Running it

- UI: new task, pick workflow "Team KB Ingest" (explicit target skips the classifier), pick project `devrel-knowledgebase`, task text e.g. `team devrel: ingest all new sources`.
- API: start a workflow run with `workflowId: "team-kb-ingest"`, `projectId: "devrel-knowledgebase"`, and the task text as input (see `libs/contracts/src/workflows/workflows.contract.ts`).

## Known quirks of the current devrel KB

- The five `.vtt` transcripts sit in `meetings/`, while `_meta/log.md` says they were moved to `raw/`. The agent flags this rather than moving files.
- Transcripts carry no date; the agent takes it from the filename/git history if possible, otherwise flags it for the human.
