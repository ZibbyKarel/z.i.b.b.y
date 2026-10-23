# TODO 10 — Self-edit + Upgrade

**Raw TODO item:** Self-edit + upgrade: ZIBBY upravuje sám sebe přes worktree a PR, tlačítko Upgrade vedle limitů aktualizuje větev

## Interpretation (night-run rulings, operator asleep)

- **Upgrade** re-surfaces the existing, operator-triggered `POST /api/self/update`
  (`git pull --ff-only` of the ZIBBY install; a dirty tree or diverged history is refused with
  409, and it never uses `--force` or `reset`). Its old top-bar control (`SelfFreshness`) was
  deleted with the old HUD shell (`adcda915`). The hooks `useSelfStatusQuery` and
  `useSelfUpdateMutation` still exist and have no consumers. "Vedle limitů" means the AppHeader
  `limits` slot, right before the `UsagePanel`.
- **Self-edit** must obey `docs/ops/self-development.md` ("Builder ≠ Subject"): ZIBBY never edits
  its own running tree. The safe path already exists for any project:
  - A project with a `gitRemote` and no `path` is cloned by `ProjectLocalService` to
    `<cloneRoot>/<id>`.
  - Runs cut worktrees from that clone and finish with a PR (Tier-2; the operator merges).
  - Self-edit therefore means **registering ZIBBY itself as a project**: id `zibby`, `gitRemote`
    set to the install's `origin` URL, `prOpenMode: "draft"`, and never a `path`.
  - After that, the normal project UI (clone, tasks, roadmap) does the rest.
- No autonomous upgrade and no autonomous merge. Both buttons are operator clicks (Law 3).

## Requirements

1. API (contract-first, `selfContract`):
   - `SelfStatusSchema` gains `projectId: z.string().optional()`. It is present when a project
     with id `zibby` exists.
   - New route `ensureSelfProject`: `POST /api/self/project` with body `EmptyBodySchema`.
     - Returns `200 { projectId: string, created: boolean }`, or `409 ErrorSchema`.
     - It is idempotent. If project `zibby` exists and its `gitRemote` equals the install origin
       URL, it returns `created: false`.
   - 409 is returned when:
     - the install has no `origin` remote, or `isValidGitRemote(origin)` is false;
     - a project `zibby` exists with a different `gitRemote`;
     - `path.resolve(<cloneRoot>/zibby)` equals `path.resolve(installRoot())`, because the clone
       would be the builder's own tree.
   - A newly created project has these fields:

     | Field        | Value                                                                                                               |
     | ------------ | ------------------------------------------------------------------------------------------------------------------- |
     | `id`         | `"zibby"`                                                                                                           |
     | `name`       | `"ZIBBY"`                                                                                                           |
     | `desc`       | `"ZIBBY itself — self-development. Changes happen in a separate clone and land as draft PRs; the operator merges."` |
     | `gitRemote`  | the install's `origin` URL                                                                                          |
     | `prOpenMode` | `"draft"`                                                                                                           |
     | `path`       | absent                                                                                                              |

2. Web, the header Upgrade button (`apps/web/components/layout/SelfUpgrade/SelfUpgrade.tsx`),
   placed in the AppHeader `limits` slot before `UsagePanel`:
   - It is hidden when status has `currentBranch === ""` (not a git install, or before the first
     load).
   - Label:

     | State        | cs                 | en                 |
     | ------------ | ------------------ | ------------------ |
     | `behind > 0` | "Upgrade ↓{count}" | "Upgrade ↓{count}" |
     | otherwise    | "Upgrade"          | "Upgrade"          |

   - It is `intent="ghost"`, `size="sm"`.
   - Its `aria-label` describes the state: cs "Aktualizovat ZIBBY (větev {branch}, {behind} za
     origin)", en "Update ZIBBY (branch {branch}, {behind} behind origin)".
   - It is disabled while pending, and when `dirty`. A dirty tree uses the title/aria cs "Neuložené
     změny — aktualizace zablokována", en "Uncommitted changes — update blocked".
   - Click calls `updateSelf`. On 200 the label becomes cs "Aktualizováno" / en "Updated" for
     5 s, or cs "Aktuální" / en "Up to date" when `updated: false`. The status query is
     invalidated.
   - On 409 the server `message` is shown inline next to the button as error text, until the next
     click.

3. Web, the Settings → status section gets a second `Panel`, cs "Vývoj ZIBBY" / en "ZIBBY
   development", containing:
   - `InfoRow`s: branch, behind/ahead vs origin, dirty yes/no, and open PRs (each PR a link,
     `target="_blank"`, `rel="noreferrer"`).
   - One explanatory line: cs "ZIBBY se upravuje v samostatném klonu jako projekt; změny přicházejí
     jako draft PR a merge je na tobě.", en "ZIBBY edits itself in a separate clone as a project;
     changes arrive as draft PRs and you merge."
   - A button:
     - When `projectId` is present: cs "Otevřít projekt ZIBBY" / en "Open ZIBBY project", which
       navigates to `/projects/<projectId>`.
     - Otherwise: cs "Upravovat ZIBBY jako projekt" / en "Edit ZIBBY as a project", which calls
       `ensureSelfProject` and on success navigates to `/projects/<projectId>`.
     - A 409 shows the server message inline.
4. Every visible string goes through next-intl, in both cs and en.
