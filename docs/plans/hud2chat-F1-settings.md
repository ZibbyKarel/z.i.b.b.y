# F1 — Settings into the immersive shell

Part of the HUD → Chat UI migration. Read `docs/hud2chat/ROADMAP.md` and
`docs/hud2chat/DECISIONS.md` first (especially **D5** and **D7**). Read
`.claude/skills/design-system/SKILL.md` before touching `libs/design-system`.

**Why settings first:** it is the operator's own named reference case — "the settings page
gets rewritten into the new layout and DS language, and Chat UI just links to it." It is
the proof that the F0 shell works on a real page, so the *look* matters here more than the
mechanics. Everything F1 establishes gets repeated 13 more times.

## Deliverable 1 — `HudPanel` glass variant (D7)

`libs/design-system/src/components/HudPanel/` — add `surface?: "hud" | "glass"`, default
`"hud"` so **every existing call site is unchanged**. `"glass"` renders the panel with the
`GlassSurface` visual language (gradient + backdrop blur, panel radius) while keeping the
existing title/padding/children contract identical.

- Extend `HudPanelTestId` only if a new element appears; prefer reusing existing testids.
- Add a test asserting: default is unchanged from today, and `surface="glass"` renders the
  glass treatment.
- Add a Storybook story showing both variants side by side.
- Do **not** change any existing consumer in this phase.

## Deliverable 2 — `/settings` adopts the immersive shell

`apps/web/features/settings/Screen.tsx` (272 LOC).

Current structure:
`PageContainer` → `Stack gap="250"` → `PageHeader` → `Tabs direction="vertical"` (10 tabs,
`?tab=` deep-linked, `TabPanel` only mounts the active tab) → footer block
(`butlerSign` icon + mono text) outside `Tabs` but inside the outer `Stack`.

Change to:
- Drop `PageContainer` and the `<PageHeader />` element. Thread its `title`/`subtitle`
  strings into the F0 `ImmersivePage` wrapper's props instead. **Read the actual
  `ImmersivePage` props from the F0 commit — do not guess the API.**
- Everything from `<Tabs>` down stays structurally as-is. The 10 tabs, `?tab=` round-trip
  via `router.replace`, `asSettingsTab`, the caffeinate localStorage key
  (`zibby.caffeinate`), and the locale-cookie write + `router.refresh()` all keep working
  **unchanged** — verify by test, this is behaviour we must not regress.
- `PageContainer` was the only thing bounding width (`maxWidth: 1400px`, `marginInline:
  auto`). The shell body is unbounded, so re-add an equivalent max-width `Container` inside
  the shell body or the vertical `TabList` (`w-52`) plus panels will stretch on wide
  viewports. This is a real regression risk — do not skip it.
- The footer block (butlerSign + mono text) must end up inside the shell body, below the
  tabs, as it is today.

## Deliverable 3 — glass pass over settings panels

Pass `surface="glass"` to the `HudPanel`s that make up the settings page so it reads as one
surface with `/chat`:
- the two inline panels in `Screen.tsx` (preferences, system)
- the panels inside `components/`: `SystemSection`, `SelfKnowledgeSection`,
  `MandateSection`, `AutomationsSection`, `ActivitySection`, `MachineSection`,
  `ChatSection`, and `WatcherRows` if it renders one

**Do NOT** touch `apps/web/features/gates/components/GateRulesSection.tsx` — it is shared
with `/gates` (phase F7) and changing it here would restyle a page we have not migrated.
Report it as a known visual seam in the gates tab; that is the accepted migration tax.

If any of these is not a plain `HudPanel` wrapper, stop and report it rather than
improvising a restructure.

## Deliverable 4 — route registration + chat link

- Register `/settings` in the F0 route table so it renders in the fullscreen/immersive shell
  rather than `MainLayout`.
- `apps/web/features/chat/components/ChatToolDock.tsx` already links to `/settings` via
  `SETTINGS_ITEM` — confirm it still works and that the back button returns to `/chat`.

## Verification
- `pnpm exec prettier --write` + `pnpm exec eslint --fix` on every touched file.
- `pnpm check:lint`
- `tsc -p apps/web` **directly** (`rtk pnpm typecheck` lies); also typecheck the DS project.
- Scoped vitest: the settings tests, the `HudPanel` test, the `AppShell` test.
- The `?tab=` deep link and the caffeinate/locale behaviour must be covered by a test that
  would fail if the migration broke them.

## Out of scope
Restructuring any settings section's content. Touching `GateRulesSection`. Migrating any
other page. Changing `MainLayout`/`Sidebar`/`RightRail`. **Do not commit** — the
orchestrator reviews and commits.
