# Phase 126a — scope inbound GitHub questions to ZIBBY's own PRs and explicit mentions

> TODO.md item 1: _"v projektu shoptet-partner-cli se stahují všechny možné otázky. Měly by
> se stahovat opět jen ty, které se týkají PR, která otevřel ZIBBY a nebo těch, kde jsem
> výslovně mentioned."_

Arc: [`phase-126/PROGRESS.md`](./phase-126/PROGRESS.md) · decisions:
[`phase-126/DECISIONS.md`](./phase-126/DECISIONS.md)

---

## Root cause

`GitHubChannelAdapter.searchMineOrMentioned()`
(`apps/api/src/channels/adapters/github.adapter.ts:95-124`) runs **two** GitHub searches and
unions them:

```
q=repo:{repo} is:open mentions:{username}{since}
q=repo:{repo} is:open assignee:{username}{since}
```

- `mentions:` is exactly the operator's condition (b) — keep it verbatim.
- `assignee:` is the leak. On a repo the operator works on professionally, *everything*
  assigned to them is ingested regardless of who opened it or whether they were addressed.
  Triage then labels whatever reads interrogative as a `question`
  (`keyword-triager.ts:12-13`), so the inbox fills with other people's threads.

Condition (a) — "PRs that ZIBBY opened" — is **not expressed at all** today. `assignee:` is
not a proxy for it.

## Target behaviour

Poll exactly two sets and union them:

1. **Explicit mentions** — unchanged `mentions:{username}` search.
2. **ZIBBY-opened PRs** — the PR numbers ZIBBY itself opened for this project, polled
   directly, filtered to those updated after the cursor.

`assignee:{username}` is dropped from the channel adapter.

## Decisions to record in DECISIONS.md

- **D6 — "ZIBBY opened it" comes from ZIBBY's own record, not from `author:{username}`.**
  ZIBBY opens PRs with the operator's credentials, so `author:` cannot tell a ZIBBY PR from
  one the operator opened by hand. `ZibbyPrLocator.numbersFor(projectId)`
  (`apps/api/src/review-learning/zibby-pr.locator.ts:31-51`) already answers this exactly,
  unioning the artifact registry (kind `"pr"`) with directed tasks' `outcome.pr.url`. It is
  already used for precisely this purpose by `ReviewCommentFetcher`
  (`review-comment.fetcher.ts:107-108`) — reuse it, do not invent a second answer.
- **D7 — no new config knob.** The operator asked for a behaviour correction, not an option.
  `GitHubConfigSchema` stays as-is. (Note for a future reader: `RoadmapSourceService` also
  uses `assignee:{username}`, deliberately — roadmap sync's job *is* "my work items". Do not
  "fix" it to match. Different feature, different question.)
- **D8 — the PR-number set is passed into `poll()`, the adapter is not made DI-aware.**
  `AdapterRegistry` constructs adapters with plain `new`
  (`adapters/adapter-registry.ts:25`). Converting the registry to Nest DI would drag
  `ArtifactsModule` + `ScheduledTasksStorageModule` into `ChannelsModule` and risks the DI
  cycle this codebase has already been bitten by. Instead `ChannelWatcherService` — which is
  already DI-constructed — resolves the numbers and hands them to `poll()`.

## Implementation

### 1. `ChannelAdapter.poll()` gains an optional context

In `apps/api/src/channels/adapters/adapter.ts`:

```ts
/** Per-poll context the watcher resolves; adapters ignore what they don't use. */
export interface PollContext {
  /** PR/issue numbers ZIBBY itself opened for this integration's project. */
  readonly zibbyPrNumbers?: readonly number[];
}
```

`poll(integration, creds, cursor, ctx?: PollContext)`. **Optional** so every other adapter
(slack, email, jira, calendar, sentry) compiles untouched. Do not thread it into adapters
that have no use for it.

### 2. `ChannelWatcherService` resolves it

Inject `ZibbyPrLocator`. Before polling a `github`-kind integration, call
`numbersFor(integration.projectId)` and pass the result in `ctx`.

**Fail-open, never fail the poll:** if the locator throws or the project has no PRs, pass an
empty array and let the mentions search carry the poll. A bookkeeping failure must not stop
channel ingestion.

Check whether `ZibbyPrLocator` is exported from a module `ChannelsModule` can import without
closing a cycle. If it is not, the escape hatch this repo already uses is `ModuleRef` +
lazy import — **not** `forwardRef`. Verify with `pnpm exec vitest run apps/api/src/health --project api`;
the health e2e is the oracle for a broken DI graph.

### 3. `GitHubChannelAdapter`

- `searchMineOrMentioned` → rename to reflect what it now does (e.g. `searchMentioned`), and
  delete the `assignee:` query. One search remains.
- New private `fetchZibbyPrs(repo, numbers, cursor, creds)`:
  - `GET /repos/{repo}/issues/{number}` per number — the set is small (open ZIBBY PRs for one
    project). No search endpoint accepts a number list, so N direct reads is the honest
    implementation.
  - Skip any whose `updated_at` is not newer than the cursor.
  - Skip `state !== "open"` — the mentions search is already `is:open`; keep both halves
    consistent.
  - A 404 on one number must not fail the poll (a PR can be deleted) — skip it and continue.
- `poll()` unions the two sets, **deduping by issue number** exactly as the old two-search
  union did, then applies the existing `streams` filter and cursor advance unchanged.
- Cursor semantics do not change: still the newest `updated_at` across everything ingested.

Leave `listAll()` alone. It is only reachable when `config.username` is unset, which
`GitHubConfigSchema` (`integration.schema.ts:83-91`) now forbids — dead, but deleting it is
a separate cleanup and not this fix.

### 4. Rate-limit posture

The mentions search plus up to N single-issue reads must stay within the adapter's existing
rate-limit surfacing (`github.adapter.ts` already surfaces rate limits — read how and keep
that behaviour). If `numbers.length` is large, cap it and log what was dropped rather than
silently truncating.

## Tests (`--project api`)

`apps/api/src/channels/adapters/github.adapter.test.ts` — the existing test at L109-153
asserts **both** `mentions:` and `assignee:` are queried. That assertion is now wrong; change
it, don't delete the test:

- Only one search is issued, and its `q` contains `mentions:karel` and **not** `assignee:`.
- With `ctx.zibbyPrNumbers = [7, 9]`, `GET /repos/{repo}/issues/7` and `/9` are fetched.
- A ZIBBY PR whose `updated_at` is older than the cursor is not ingested.
- A ZIBBY PR that also appears in the mentions search is ingested **once** (dedupe by number).
- A 404 on one ZIBBY PR number does not fail the poll; the rest still ingest.
- `ctx` omitted entirely → behaves as mentions-only, no crash. (Pins the optionality.)

`channel-watcher.service.test.ts`:
- A `github` integration gets `zibbyPrNumbers` passed; a `slack` integration does not.
- A throwing `ZibbyPrLocator` does not fail the poll (fail-open).

## Definition of done

1. `pnpm exec vitest run apps/api/src/channels --project api` green.
2. `pnpm exec vitest run apps/api/src/health --project api` green (DI graph oracle).
3. `pnpm exec vitest run --project contracts` green if any schema was touched.
4. Prettier + ESLint clean on touched files; `tsc -p tsconfig.base.json --noEmit` clean.
5. If `docs/api/channels.md` documents the polling behaviour, update it — the docs-sync gate
   is blocking on pre-commit.
6. One commit: `fix(channels): ingest only ZIBBY-opened PRs and explicit mentions from GitHub`.

## Out of scope

- Triage's question classification (`keyword-triager.ts`) — the ask is about what gets
  *downloaded*, not how it is labelled afterwards.
- `RoadmapSourceService`'s `assignee:` query (see D7).
- Deleting `listAll()`.
- Any change to the inbox UI.
