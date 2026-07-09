# Phase 98 — Project detail cleanup (root-path removal, category Selector, clone loading)

> TODO (docs/../TODO.md "Další nalezené věci"):
> - _"Detail projektu - odstranit z projektu pole 'Cesta k rootu'."_ (root path is defined in
>   Settings as the machine-local clone base; per-project it should not be hand-entered — the
>   operator's preferred model is "clone a duplicate repo beside and treat it as a standard project".)
> - _"Detail projektu - Kategorie se bude vybírat přes Selector."_
> - _"Detail projektu - Tlačítko 'Klonovat' by mělo být ve stavu loading když se klonuje a né
>   disabled. Loading state zařídí, že se na tlačítko nedá kliknout."_

## Recon (verified)

- Detail/edit screen: `apps/web/features/projects/ProfileScreen.tsx` (no separate edit modal;
  create + edit share one panel).
- The basics form: `apps/web/features/projects/components/ProjectBasicsPanel.tsx`.
  - Root-path field = the `path` `FormTextInput` at **lines 260–265** (label `fields.path`
    = "Cesta k rootu"). Coupled to: `ProjectBasicsBody.path` (l.29), `ProjectEditValues.path`
    (l.78), default `path: project?.path ?? "~/Projects/"` (l.166), submit
    `path: values.path.trim()` (l.215), and the **save-gate** `canSave` (l.227–228) which
    currently also requires `path` non-empty.
  - Category field = a row of `ChipToggle` chips (l.103–117 component, l.274–297 render), NOT
    a dropdown. `category` string keyed by category **name**; categories from prop
    `categories: Category[]` via `useProjectCategoriesQuery()` (ProfileScreen l.222, passed l.313).
- Clone button: `ProfileScreen.tsx` **l.578–588** — already `loading={cloneProject.isPending}`
  and swaps label to `localState.cloning`, but `disabled` also ORs in `cloneProject.isPending`
  (l.580) so it renders disabled instead of loading. DS `Button` already suppresses clicks while
  `loading` (`onClick={loading ? undefined : onClick}`, sets `aria-busy`) — no DS change needed.
- Contract: `libs/contracts/src/projects/project.schema.ts` — `ProjectSchema.path`
  is `z.string().min(1)` **required** (l.133); `CreateProjectSchema` = `omit({ hasSecrets })`
  (still requires path); `UpdateProjectSchema` = partial.
- Server reality (`apps/api/src/projects/project-local.service.ts` doc + code): `project.path`
  is the SYNCED registry field but **on any one machine may not exist**; resolution falls back to
  `<cloneRoot>/<project.id>` where `cloneRoot` comes from machine config (Settings). So `path`
  is genuinely machine-local / derivable and does NOT need to be user-entered — making it optional
  matches the code's own contract.

## Change 1 — Remove the root-path field (contract-first)

1. **Contract:** make `path` optional in `project.schema.ts`: `path: z.string().min(1).optional()`
   (keep the `min(1)` so a present value is still non-empty). `CreateProjectSchema` /
   `UpdateProjectSchema` inherit optionality. Update the JSDoc/comment on `path` to say it is
   machine-local and derived from the Settings clone base when absent.
2. **Fix TS fallout** from `path?: string` across the workspace — typecheck will surface every
   site. Expected touch points and required handling (do NOT change runtime behaviour, only make
   `undefined` safe):
   - `apps/api/src/projects/project-local.service.ts` (`isPresentGitRepo(project.path)`,
     `resolvedPath: project.path`, `{ path: project.path, isGitRepo:false }`): treat missing
     `path` as "not present on this machine" → falls through to the cloneRoot branch exactly as
     an empty/non-existent path does today. Guard `isPresentGitRepo` to return false for
     `undefined`.
   - `apps/api/src/projects/resolved-project.*` and any storage/service reading `project.path` —
     default to `undefined`/skip, never `""` concatenation into a filesystem path.
   - `ProfileScreen.tsx` subtitle uses `project?.path` read-only (l.558) — render nothing / a
     placeholder when absent (do not show `undefined`).
3. **UI (`ProjectBasicsPanel.tsx`):** delete the `path` `FormTextInput` (l.260–265); remove
   `path` from `ProjectBasicsBody`, `ProjectEditValues`, defaults, and the submit mapping; drop
   `path` from the `canSave` gate so only `name` (non-empty) gates save. Do NOT send a `path`
   key in create/update payloads (omit it → contract accepts).
4. **i18n:** the `fields.path` / `pathHint` / `pathPlaceholder` keys become unused — remove them
   from `cs.json` and `en.json` to avoid dead keys (verify with a grep that nothing else
   references them).

## Change 2 — Category via `SelectField` (single-select dropdown)

Replace the `ChipToggle` row (l.274–297) with the DS **`SelectField`**
(`libs/design-system/src/components/form/SelectField/SelectField.tsx`), single-select — same
primitive `ProjectCompanyPanel.tsx` (l.67–96) already uses:

- `options = categories.map(c => ({ value: c.name, label: c.name }))`. Prepend a "no category"
  option (`value: ""`, label from a new key `projects.fields.categoryNone` = "Bez kategorie" /
  "No category") so the optional category can be cleared.
- `label={t("fields.category")}`, `value={field.value ?? ""}`,
  `onValueChange={(v) => field.onChange(v || undefined)}` wired through the existing `Controller`.
- Remove the now-unused `ChipToggle` component (l.103–117) and its `Tag`/`Pressable` imports if
  they become unused. Keep the `categories.length > 0` guard (render the SelectField only when
  categories exist, matching current behaviour).

## Change 3 — Clone button shows loading (not disabled)

In `ProfileScreen.tsx` l.580 change `disabled={!project?.gitRemote || cloneProject.isPending}`
→ `disabled={!project?.gitRemote}`. Leave `loading={cloneProject.isPending}` and the label swap
as-is. This yields a spinning, click-suppressed button while cloning.

## Files

- `libs/contracts/src/projects/project.schema.ts`
- `apps/api/src/projects/project-local.service.ts` (+ any other `project.path` readers surfaced
  by typecheck: `resolved-project.*`, storage services)
- `apps/web/features/projects/components/ProjectBasicsPanel.tsx`
- `apps/web/features/projects/ProfileScreen.tsx`
- `apps/web/i18n/messages/{cs,en}.json`
- Tests: `ProfileScreen.test.tsx` (clone button no longer disabled while pending → assert
  `loading`/`aria-busy` instead), `ProjectBasicsPanel` test if present (category is now a
  SelectField; path field gone), contract test for projects if it asserts `path` required.

## Verification

- `pnpm check:types` clean (this is the load-bearing gate for the `path` optionality change).
- Scoped lint: `pnpm exec eslint` on the touched files (or `pnpm check:lint`).
- `pnpm test` — targeted project + contract + DS suites green. Update/extend tests per above.
- Manual reasoning: creating a project with no path succeeds (contract accepts, server derives
  machine path from cloneRoot); editing category via dropdown persists; clone button spins and
  is un-clickable while pending, re-enables on settle.

## Constraints

- No `forwardRef`, no `any`, DS primitives only, no inline `style` on DOM in `apps/web`.
- Contract-first: schema change lands before UI. Keep the diff tight; do not touch chat scene,
  machine WIP, or unrelated project tabs.
- After changes run the three-command gate (`check:lint`, `check:types`, `test`) and fix all
  errors before reporting done.
