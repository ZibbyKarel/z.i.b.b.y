# Self-edit + Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the operator-triggered ZIBBY Upgrade (ff-only pull) back into the header next to the limits, and add "self-edit": registering ZIBBY as its own project (cloned separately, draft PRs). Both are reachable from Settings → status.

**Architecture:**

- Extend `selfContract` with one route, `ensureSelfProject`, and one status field, `projectId`. `SelfService` reads the install's `origin` URL with the existing bounded `exec`, and creates the project through the projects storage service.
- Web: a `SelfUpgrade` header composite, plus a `SelfDevelopmentPanel` in Settings. Both use the existing `features/self` hooks and one new mutation hook.

**Tech Stack:** ts-rest + Zod 4, NestJS, Next.js 15 / React 19 / TanStack Query / next-intl, DS `Button`, `Panel`, `Stack`, `Typography`, `Link`.

**Spec:** `docs/superpowers/specs/todo-10.md`

## Global Constraints

- pnpm only. Validate per file and run only the related tests. No `any`, no `forwardRef`, and no inline `style` on DOM nodes in `apps/web`.
- Every visible string goes through next-intl in cs and en, with the exact copy from the spec.
- Self project id is exactly `"zibby"`, with `prOpenMode: "draft"` and **no `path`**, ever.
- Never `--force`, `reset`, or an autonomous upgrade or merge. Both actions are operator clicks.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. If the self-knowledge pre-commit gate blocks, run `pnpm self-knowledge:generate`, stage the note and retry. If docs-sync asks for a doc, update `docs/api/self.md` (or whatever it names). Never use `--no-verify`.

## Review Focus

- Origin is missing or an invalid remote (`file://`, a bare path) → 409, and no project is written. Task 1 test.
- Project `zibby` exists with a different remote → 409, and the project is untouched. Task 1 test.
- `<cloneRoot>/zibby` resolves to the install root → 409. Task 1 test.
- A second click on "Edit ZIBBY as a project" → idempotent `created: false`, no duplicate. Task 1 test.
- Upgrade on a dirty tree → the button is disabled, and a 409 message shows inline when the server still refuses. Task 2 tests.

---

### Task 1: API — `projectId` in status + `POST /api/self/project`

**Files:**

- Modify: `libs/contracts/src/self/self.schema.ts` (add `projectId` to `SelfStatusSchema`; add `EnsureSelfProjectResultSchema = z.object({ projectId: z.string(), created: z.boolean() })` and its type), `libs/contracts/src/self/self.contract.ts` (route `ensureSelfProject`), `libs/contracts/src/self/self.contract.test.ts`
- Modify: `apps/api/src/self/self.service.ts`, `self.controller.ts`, `self.module.ts` (import whatever module exports the projects storage service and the machine config used for `cloneRoot`; check `projects.module.ts` exports and `ProjectLocalService`'s `machineConfig`), `self.service.test.ts`
- Docs: `docs/api/self.md` (new route)

**Interfaces:**

- Produces: `selfContract.ensureSelfProject` (`POST /self/project`, body `EmptyBodySchema`, `200: EnsureSelfProjectResultSchema`, `409: ErrorSchema`). `SelfService.ensureSelfProject(): Promise<EnsureSelfProjectResult>` throws `SelfProjectConflictError(message)`, which maps to 409. `SelfStatus.projectId?: string`. `export const SELF_PROJECT_ID = "zibby"` in `self.service.ts`.

- [ ] **Step 1: Failing tests** in `self.service.test.ts`, following its existing exec-mocking style.
  - `ensureSelfProject creates the zibby project from origin`. Origin is `git@github.com:me/zibby.git` and there is no existing project → storage create is called with exactly the spec's fields (`id`, `name`, `desc`, `gitRemote`, `prOpenMode: "draft"`) and **no `path` key**. The result is `{ projectId: "zibby", created: true }`.
  - `is idempotent when zibby already points at origin` → `created: false`, and create is not called.
  - `409 when zibby exists with another remote`. Do not overwrite it.
  - `409 when origin is missing`, i.e. exec rejects.
  - `409 when origin is not a valid remote`, e.g. `file:///tmp/x`.
  - `409 when <cloneRoot>/zibby is the install root`.
  - `status carries projectId when zibby exists`, and omits it otherwise.
  - Add a controller-level or contract test that 409 maps to `{ message }`, following the existing `updateSelf` 409 test.
- [ ] **Step 2:** `pnpm exec vitest run apps/api/src/self libs/contracts/src/self` → FAIL.
- [ ] **Step 3:** Implement. Get the remote with `git remote get-url origin` via the existing bounded `exec` at `installRoot()`, then `.trim()`. Validate it with `isValidGitRemote` (exported from `@zibby/contracts`; check where it lives).
- [ ] **Step 4:** Tests PASS. `pnpm exec tsc -p apps/api/tsconfig.json --noEmit` is clean.
- [ ] **Step 5: Commit** `feat(api): self project — register ZIBBY as its own project for self-edit`.

### Task 2: Web — header `SelfUpgrade`

**Files:**

- Create: `apps/web/components/layout/SelfUpgrade/SelfUpgrade.tsx`, `SelfUpgrade.test.tsx`, `index.ts`
- Modify: `apps/web/components/layout/AppShell/AppShell.tsx` (`useHeaderTrailing`: `limits` becomes a row `Stack direction="row" align="center" gap="100"` holding `<SelfUpgrade />` then the existing `UsagePanel`)
- Modify: `apps/web/i18n/messages/cs.json`, `en.json` (namespace `shell.selfUpgrade`, keys: `label`, `labelBehind`, `aria`, `dirty`, `updated`, `upToDate`)

**Interfaces:**

- Consumes: `useSelfStatusQuery`, `useSelfUpdateMutation` from `features/self`. Check `useSelfUpdateMutation` already invalidates the status query; if not, add that.
- Produces: `export function SelfUpgrade()` and `export enum SelfUpgradeTestId { Button = "self-upgrade-button", Error = "self-upgrade-error" }`.
- The 409 message extraction mirrors the deleted helper (`git show 2efeb6f4:apps/web/components/layout/TopBar/SelfFreshness.tsx`, `updateErrorMessage`). Put it in `features/self/updateErrorMessage.ts` so Task 3 reuses it.

- [ ] **Step 1: Failing tests** (mock `features/self` with `vi.hoisted` state, and use `renderWithProviders` with the same vitest project as other `components/layout` tests):
  - `hidden when not a git install`. `currentBranch ""` → no Button.
  - `shows behind count`. `behind 3` → the text contains "↓3".
  - `aria-label describes branch and behind`.
  - `disabled with dirty title when the tree is dirty`.
  - `click updates and shows Updated`. mutate is called with `{ body: {} }` (match the hook's real shape). Calling its `onSuccess` with `{ status: 200, body: { updated: true, behind: 0 } }` shows `updated`, and with `updated: false` shows `upToDate`.
  - `Updated` reverts to the label after 5 s (fake timers).
  - `409 shows the server message inline`. Pass an error `{ status: 409, body: { message: "dirty" } }` through `onError` or the hook's `error` (match how you wire it) → `SelfUpgradeTestId.Error` has the text "dirty".
- [ ] **Step 2:** FAIL → implement → PASS. Also run any existing `AppShell` tests. `pnpm exec tsc -p apps/web/tsconfig.json --noEmit` is clean.
- [ ] **Step 3: Commit** `feat(web): Upgrade button next to the limits (ff-only self update)`.

### Task 3: Web — Settings "ZIBBY development" panel

**Files:**

- Create: `apps/web/features/self/mutations/useEnsureSelfProjectMutation.ts` (+ export; invalidates the self status query and the projects list query key `getProjectsQueryKey()` from `features/projects/queries`)
- Create: `apps/web/features/settings/components/SelfDevelopmentPanel.tsx`, `SelfDevelopmentPanel.test.tsx`
- Modify: `apps/web/features/settings/Screen.tsx` (render `<SelfDevelopmentPanel />` after the system `Panel` in the `status` section; reuse that file's `InfoRow` by exporting it or moving it next to the panel — your call; keep it DRY)
- Modify: i18n cs and en (namespace `settings.selfDev`)

**Interfaces:**

- Consumes: Task 1's `ensureSelfProject` route and `projectId`, and Task 2's `updateErrorMessage`.
- Produces: `export function SelfDevelopmentPanel()` and `export enum SelfDevelopmentPanelTestId { Root = "self-dev-panel", Action = "self-dev-action", Error = "self-dev-error", PrLink = "self-dev-pr" }`.

- [ ] **Step 1: Failing tests:**
  - `renders branch, behind/ahead, dirty and PR links`. 2 PRs → 2 `PrLink` elements with `href` set and `target="_blank"`.
  - `with projectId the action opens the project` → router push `/projects/zibby`, and ensure is not called.
  - `without projectId the action ensures then navigates`. ensure mutate is called. Its `onSuccess` with `{ status: 200, body: { projectId: "zibby", created: true } }` → push `/projects/zibby`.
  - `409 shows the message inline`.
  - `hidden when not a git install` (`currentBranch ""` → no Root).
- [ ] **Step 2:** FAIL → implement → PASS. Run `apps/web/features/settings` tests. `tsc` on `apps/web` is clean.
- [ ] **Step 3: Commit** `feat(web): Settings — ZIBBY development panel (self-edit as a project)`.
