# TODO 16 — Automatic PR review and comment handling

**Raw TODO item:** Automatické review a zpracování komentářů u PR per firma/projekt (vedle auto
synchronizace a auto implementace), s výběrem workflow podle obsahu PR

## Interpretation (night-run rulings, operator asleep)

The PR inbox already offers operator-click actions:

- **"Do code review"** (`InboxReviewService.start`, one of the levels `quick | thorough | tested | browser`,
  each a `pr-review-*` workflow). Its final `comment` phase parks at an approval gate, so nothing
  is posted without the operator.
- **"Address review comments"** (`InboxAddressCommentsService.start`, workflow
  `pr-address-comments`). It fast-forward pushes the fixes on its own after an `Addressed: all`
  report (`isAutoPushAddressComments`, approved on the spot as Tier 2). Any other report parks a
  push approval.

The roadmap automation toggles **`autoSync`** and **`autoPlay`** are tri-state per project
(`null` = inherit). They come with company defaults (`Company.roadmapDefaults`), a global default
of `false`, `resolveRoadmapConfig`, and the panels `RoadmapAutomationPanel` and
`CompanyRoadmapDefaultsPanel`.

This item adds two more toggles beside them, and a heartbeat that starts those existing actions on
its own:

- **`autoReview`** — review incoming PRs (the "to-review" bucket) automatically. The review
  level, i.e. which `pr-review-*` workflow runs, is **chosen from the PR's content**.
- **`autoAddressComments`** — address unresolved review comments on the operator's own PRs
  ("mine", changes requested) automatically.

What stays gated:

- **Review posting** stays behind the existing approval gate. That is unchanged.
- **Ruling: an auto-started address-comments run never auto-pushes.** Its push always parks as an
  approval, even after `Addressed: all`. The operator didn't click, and a push to a PR branch is
  an outward commit, so it is Tier 3. Law 3 applies: when unsure, take the higher tier.

## Requirements

1. **Config** (`libs/contracts/src/roadmap/roadmap-item.schema.ts`).
   - Add `autoReview` and `autoAddressComments` to every shape that holds the existing toggles,
     with exactly the same semantics:
     - `RoadmapConfigSchema` (`z.boolean().nullable().default(null)`);
     - `RoadmapDefaultsSchema` (optional boolean);
     - `EffectiveRoadmapConfigSchema` (boolean plus `source`);
     - `RoadmapConfigPatchSchema` (nullable, partial; spelled out, never `.partial()` over
       defaults);
     - `GLOBAL_ROADMAP_DEFAULTS` (`false`);
     - `resolveRoadmapConfig`.
   - An old `_config.json` without the new keys reads them as `null`, i.e. inherit, then the
     global `false`.
   - A patch that omits a key leaves it unchanged.
   - Any company-defaults write path (`Company.roadmapDefaults`) accepts the new keys.
2. **Heartbeat** — `PrAutomationService` (`apps/api/src/inbox/pr-automation.service.ts`).
   - It shares the roadmap heartbeat knob `systemConfig.roadmapTickMs`, read live; `0` disables.
     There is no new knob. It schedules itself the same way `RoadmapTickService` does.
   - Each tick reads `InboxService.listPrs()` and, for each PR with a `projectId`, resolves that
     project's effective config (project config plus its company's defaults).
   - **Auto review.** A PR qualifies when all of these hold:
     - its effective `autoReview` is on;
     - `bucket === "to-review"`;
     - it is not a `draft`;
     - its head sha is known;
     - there is no review task for this PR whose `prReview.headSha` equals the current head
       (any state: a failed or discarded review of the same head is not retried);
     - no review task for the PR is `running` or `awaiting-approval`.

     It then calls `InboxReviewService.start({ projectId, repo, number, title, level })` with
     `level = selectReviewLevel(files)` and stamps `prReview.auto = true`.

   - **Auto address comments.** A PR qualifies when all of these hold:
     - its effective `autoAddressComments` is on;
     - `bucket === "mine"`;
     - `review === "changes-requested"`;
     - `unresolvedThreads > 0`;
     - there is no address-comments task for this PR whose `headSha` equals the current head;
     - no address-comments task for the PR is `running` or `awaiting-approval`.

     It then calls `InboxAddressCommentsService.start({ ..., auto: true })`.

   - **Throttle:** at most **3** auto starts per tick across all projects, in inbox order. The
     rest wait for the next tick.
   - **Fail open:** an error on one PR is logged and skipped, and the tick continues. A
     `listPrs` failure ends the tick quietly.
   - Each auto start records an activity entry of the new kind **`pr-automation-started`**, with
     the summary `auto review (<level>) <repo>#<n>` or `auto address comments <repo>#<n>` and
     refs `{ projectId, taskId, itemId: "<repo>#<n>" }`. Use only ref keys that
     `ActivityRefsSchema` allows; extend it if `itemId` doesn't fit.

3. **Head sha.** Add optional `headSha` (40-hex) to `InboxPrSchema`, filled from the pull fetch
   `InboxService` already makes. If it is missing, the PR is skipped by the automation.
4. **Workflow choice by content** — the pure function `selectReviewLevel(files)` in
   `apps/api/src/inbox/select-review-level.ts`.
   - Its input is the PR files list (`GET /repos/{repo}/pulls/{n}/files?per_page=100`:
     `filename`, `additions`, `deletions`), fetched by a new `InboxReviewService` method.
   - Rules, first match wins:
     1. **`browser`**: any file matching `/\.(tsx|jsx|vue|svelte|css|scss|html)$/i`. The UI
        changed, so click through it.
     2. **`thorough`**: any file path matching
        `/(auth|security|secret|token|crypto|permission|migration|contract|schema)/i` or ending
        in `.sql`, or more than 500 changed lines (additions + deletions), or more than 20 files.
     3. **`tested`**: any file that is not documentation or config. Docs/config means
        `/\.(md|mdx|txt|rst|ya?ml|json|toml|ini|lock)$/i`, or a path under `docs/`.
     4. **`quick`**: otherwise (docs/config only), including an empty list.
   - If the files fetch fails, the level is `quick`. Ruling: cheapest, and the operator can rerun
     it at a higher level.
5. **Auto address-comments never auto-pushes.**
   - `AddressInboxPrCommentsInput` gains `auto?: boolean`, which is set only server-side by the
     automation. The HTTP route keeps ignoring or rejecting it, so a client cannot set it.
   - `prAddressComments.auto?: true` is stamped on the task.
   - When `auto` is set, an `Addressed: all` report parks the push approval like any other report
     instead of approving it on the spot. Everything after the operator approves is unchanged.
6. **Web.**
   - `RoadmapAutomationPanel` (project) and `CompanyRoadmapDefaultsPanel` (company) show the two
     new toggles under the existing ones, with the same tri-state control and the same
     source-provenance copy.
   - Labels:
     - `autoReview`: cs "Automatické review PR" / en "Automatic PR review", with the hint cs
       "Nové PR k review projde workflow vybrané podle obsahu. Komentáře se odešlou až po tvém
       schválení." / en "Incoming PRs to review run a workflow chosen from their content.
       Comments are posted only after your approval."
     - `autoAddressComments`: cs "Automatické zpracování komentářů" / en "Automatic comment
       handling", with the hint cs "Na tvých PR s požadovanými změnami opraví komentáře. Push
       čeká na tvé schválení." / en "Fixes review comments on your PRs with changes requested.
       The push waits for your approval."
   - In the PR inbox, a review or address-comments state chip whose task was auto-started shows
     a small "auto" marker: cs "auto" / en "auto". If plumbing this to the inbox row is
     disproportionate, record a ruling and skip it.
7. **Docs.** Update `docs/api/inbox.md` (the automation section), the roadmap config docs, and
   whatever docs-sync names.
