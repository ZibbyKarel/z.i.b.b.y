# Machine — controlling the computer behind the gate (N5a)

ZIBBY reaches beyond the repo onto the operator's machine — **Tier-3 only**.
Proposing an action never executes anything: it computes a dry-run preview,
stores a durable record (`MACHINE_ACTIONS_DIR`, default `ZIBBY_DATA_DIR/machine`)
and parks an approval of `kind: "machine"` (risk high). Only the operator's
approval executes the action — exactly once. The pattern mirrors the
jira-issue flow (`ResumableRunner` registry), but the pending state is a
DURABLE file: a restart doesn't lose the gate, and the preview remains an audit
map of old→new (reversible by default).

## Action vocabulary (closed, grows explicitly)

- `rename-files` `{folder, find, replace}` — rename files in a NAMED folder:
  literal substring match on the basename. Risk high. Guards (fail-closed):
  - `folder` must be an absolute, existing directory;
  - `find`/`replace` must contain no path separators (no traversal);
  - an empty preview → 422; colliding targets → 422;
  - execution re-verifies every rename (source exists, target doesn't) — a
    failure → state `failed` + `error`, never a crash; renames already applied
    stay in the preview map.
- `open-maps` `{query}` (N5b) — opens Apple Maps with a search
  (`open "maps://?q=<enc>"`). Only opens a window (reversible, risk low), but
  STILL behind the gate — nothing executes silently on the machine. The opener
  is injectable (tests never actually launch anything).

## Record lifecycle

`proposed` → (approve) `executed` / (reject) `rejected` / (execution error)
`failed`. Execution writes a `machine-action` activity entry (approvals group).
A second resume, or resuming a lost record, is an idempotent no-op.

## HTTP

```
POST /api/machine/actions        propose {action} → 201 record with preview (422 on guard failure)
GET  /api/machine/actions        list records (newest-first)
GET  /api/machine/actions/:id    a single record
```

## Operator input: chat tools (N5b)

`machine_rename {folder, find, replace}` and `open_maps {query}` in the chat
MCP (`ChatToolsService.proposeRename`/`proposeOpenMaps`) — chat may only
PROPOSE (propose never executes); a rejected guard comes back as a message, not
a crash. The gate renders a multi-line machine-approval preview via
`CodeBlock` (preserving the old → new lines).

No execute endpoint exists — the only path to execution is the approval gate
(Law 1: the gate is structural). The approval shows up in the ordinary
approval queue.
