# HUD → Chat UI migration — progress board

Live truth. Updated after every phase, immediately.

**Branch:** `feat/hud-to-chat-migration` (off `main` @ 32ce9b9e) · **Parked at PR gate** —
nothing pushed.

| #   | Phase                      | Status | Commit   | Notes                                                                                  |
| --- | -------------------------- | ------ | -------- | -------------------------------------------------------------------------------------- |
| —   | Grounding + control docs   | ✅     | —        | audit read, design corpus + current chrome grounded, operator decisions O1–O4 captured |
| F0  | Immersive shell foundation | ✅     | e683f0bf | `ImmersiveShell` (DS) + `ImmersivePage` (app) + `FULLSCREEN_ROUTES`; behaviour-neutral |
| F1  | Settings                   | ✅     | d7d2b106 | operator's reference case; `radius="none"` + border strip (D11) found by live verify   |
| F2  | Archive of tasks           | ✅     | 711d3883 | new `/archiv`; `SearchInput` added to DS; gutter reduced to an "Archiv · N" link       |
| F3  | Catalogs A                 | ✅     | f01c2395 | 8 pages; recipe hardened with steps 8–9                                                |
| F4  | Catalogs B                 | ✅     | c4fe68cb | 4 pages; D13 recorded (header/hero duplication), deliberately not patched              |
| F5  | Orchestration              | ✅     | 5765336d | header must key off route id, not selection, or `/pipelines` backHref self-loops       |
| F6  | Delivery entities          | ✅     | 12b1f113 | 7 routes incl. 685-LOC `ProfileScreen`; first dynamic `backHref`                       |
| F6b | EntityHero dedup (D13)     | ✅     | 9df0f1e8 | `showIdentity` prop, default `true`; two opt-outs; other two immune via `children`     |
| F7  | Memory + gates             | ✅     | 61eb605b | `GateRulesSection` seam resolved with D7's `surface` pattern; `/gates` stays off dock  |
| F8  | Overview dissolution       | ⬜     | —        |                                                                                        |
| F9  | Chat reachability sweep    | ⬜     | —        |                                                                                        |
| F10 | Old shell deletion         | ⬜     | —        |                                                                                        |

## Migration ledger — per route

`native` = lives inside Chat UI · `immersive` = rewritten full page Chat links to ·
`hud` = still old chrome · `deleted` = gone.

| Route                                                    | Target                        | State        |
| -------------------------------------------------------- | ----------------------------- | ------------ |
| `/chat`                                                  | native                        | ✅ native    |
| `/settings`                                              | immersive                     | ✅ immersive |
| `/archiv`                                                | immersive                     | ✅ immersive |
| `/runs`                                                  | deleted (→ `/archiv`)         | hud          |
| `/overview`                                              | deleted (→ topbar + briefing) | hud          |
| `/skills`, `/skills/[id]`                                | immersive                     | ✅ immersive |
| `/commands`, `/commands/[id]`                            | immersive                     | ✅ immersive |
| `/mcp`, `/mcp/[id]`                                      | immersive                     | ✅ immersive |
| `/hooks`, `/hooks/[id]`                                  | immersive                     | ✅ immersive |
| `/agents`, `/agents/[id]`                                | immersive                     | ✅ immersive |
| `/automations`, `/automations/[id]`                      | immersive                     | ✅ immersive |
| `/pipelines`, `/pipelines/[id]`                          | immersive                     | ✅ immersive |
| `/chains`, `/chains/[id]`                                | immersive                     | ✅ immersive |
| `/projects`, `/[id]`, `/new`, `/[id]/integrations/[iid]` | immersive                     | ✅ immersive |
| `/companies`, `/[id]`, `/new`                            | immersive                     | ✅ immersive |
| `/memory`                                                | immersive                     | ✅ immersive |
| `/gates`                                                 | immersive                     | ✅ immersive |

**Every route except `/runs` and `/overview` is migrated.** Those two are deletions, not
conversions — they are F8's job, and both carry inbound-link blockers (D16, D17).

## Session log

- **2026-07-19** — Arc opened. Audit `docs/web/hud-to-chat-migration-gap.md` read; design
  corpus and current chrome grounded by two Explore agents; operator answered the four
  strategic questions (O1–O4). Branch created, control docs written.
- **2026-07-19** — F0 landed (`e683f0bf`). Review notes: subagent reimplemented `IconTile`'s
  accent-tile recipe by hand because `IconTile` hardcodes its testid with no override;
  backdrop reproduces `ChatScreen`'s radial vignette but deliberately not its scanline/grid
  ambience. Orchestrator fixed one real defect before commit: `Container grow` and
  `Spacer grow` sat side by side in the header, so a long title would truncate at half width
  while free space sat in the spacer — Spacer removed. D7–D9 recorded from the F1/F2
  grounding pass. F1 dispatched.
- **2026-07-19** — F1 landed (`d7d2b106`). **Plan was wrong about a file location:** `HudPanel`
  is NOT a DS component — it lives in `apps/web/components/HudPanel/` as a domain composite
  over `Card`. The DS SKILL.md line listing it among DS generic components is stale. D7 was
  implemented at the real location; no DS component was needed, only a `CardTestId` export.
  Orchestrator live-verified `/settings` in the browser at 1680px and fixed one visual defect
  the subagent could not have caught in jsdom: the header band had `radius="panel"`, so a
  full-bleed band read as a floating card. Added `radius="none"` to `GlassSurface` and
  stripped the side/top borders so only the bottom hairline survives — this matches the
  design's Archiv úloh header, which is literally a `borderBottom` rule. jsdom does not
  reflect longhand `borderTop` set after the `border` shorthand, so that part is verified in
  the browser, not asserted in the test (noted in the test itself). `?tab=` deep links, live
  mandate data and 0 console errors confirmed in-browser. F2 dispatched.
- **2026-07-19** — F2 landed (`711d3883`). `/archiv` live-verified at 1680px: both grouping
  modes work, rows carry subsystem colour dots, `RunDetail` renders inline without modal
  chrome. Orchestrator fixed one polish defect the tests missed: a run with no project
  rendered a dangling `" · "` in the row subline. Subagent decisions accepted — the subsystem
  multi-select is a domain composite (needs registry colours + live counts, wrong shape for a
  generic DS primitive) and `SearchInput` is a genuine new DS primitive, distinct from
  `SearchBar` (a palette _button_) and `TextInputField` (always labelled). `ChatTasksPanel`'s
  in-gutter archive section is now just an "Archiv · N" link, per O4. Known deviation from the
  design: the detail pane auto-selects the newest row instead of showing a placeholder, because
  it reuses `findSelectedRun`'s `list[0]` fallback — matches `/runs` behaviour, flagged for the
  operator. Pre-existing console 404 (a stale run artifact) reproduces on `/runs` too — not ours.
  F3 dispatched.
- **2026-07-19** — F3 landed (`f01c2395`). Eight pages migrated cleanly; `/skills` and
  `/skills/seo` live-verified (actions in the header, 1400px bound held, back arrow href
  confirmed `/skills`, not `/chat`). The subagent surfaced two real recipe gaps, now folded
  into the plan as steps 8 and 9: detail pages carried a manual ghost "Zpět" button that
  `ImmersivePage`'s backSlot subsumes (removed in all four), and step 8's "move the route
  from the HUD-chrome test case" assumed a membership that did not exist. **One subagent
  claim was wrong and worth remembering:** it reported `npx tsc -p libs/design-system` failing
  with TS6059 as a "pre-existing baseline issue" — re-running it directly shows it clean.
  Verify tooling claims rather than inheriting them. F4 dispatched.
- **2026-07-19** — F4 landed (`c4fe68cb`). The subagent live-verified its own work this time,
  including an end-to-end automation create→detail→delete and a focus-trap tab cycle inside a
  dialog on the fullscreen shell (`Dialog` is `position: fixed` with no ancestor containing
  block, so `ImmersiveShell`'s `overflow: hidden` root does not clip it). Roster crew →
  `/agents/[id]` cross-surface link confirmed intact. Recorded **D13**: the immersive header
  duplicates `EntityHero`'s name/description — real, verified on `/agents/architect`, and
  deliberately NOT patched per page. `EntityHero` is shared by four surfaces and F5/F6 add
  more, so it becomes one decision after F6. New recipe wrinkle for later phases: a Screen
  with three early returns (pending/error/success), each wrapping its own
  `PageContainer`+`PageHeader`, needs consolidating into one `ImmersivePage` with the state as
  a `body` variable. F5 dispatched.
- **2026-07-19** — F5 landed (`5765336d`). The sharp catch this phase: with one Screen serving
  both list and detail, the header must key off the **route id**, not the selected item —
  `selected` falls back to `list[0]` even on the bare list route, which would have made
  `backHref` point `/pipelines` at itself. Canvas investigated rather than assumed: it looked
  clipped at the right edge, but its container is `overflow-x: auto` (1006 visible of 1680
  scrollable), so it is a deliberately pannable graph, not a fit-to-view regression — and the
  immersive shell gives it _more_ width than `MainLayout` did, not less.
  **New live-verification gotcha:** the shell body is now the scroll container, not the
  document, so Playwright's `fullPage: true` screenshot captures only the viewport. Scroll the
  inner container instead. Both lists gained dock icons. F6 dispatched.
- **2026-07-19** — F6 landed (`12b1f113`), the hardest phase. Seven routes including the
  685-LOC `ProfileScreen`, whose eight panels were left entirely untouched — only the page
  frame swapped and its four inline `HudPanel`s took `surface="glass"`. The nested integration
  detail produced the arc's **first dynamic `backHref`**, resolving to
  `/projects/<id>?tab=integrations` — better than the plain project route the plan asked for,
  because it returns the operator to the tab they left from. The highest-risk cross-surface
  check passed for a reason worth recording: `GatesTab`'s `/projects/:id?tab=profile` deep link
  still lands on the right tab because `ProfileScreen` reads `?tab=` client-side via
  `useSearchParams`, which is independent of whether the shell is fullscreen. `/projects/new`
  and `/companies/new` turned out to share one create-vs-edit component with an `isNew` flag,
  so F5's route-id-vs-selection trap did not recur. **No route in F6 renders `EntityHero`**, so
  D13 did not apply here — which means every consumer is now known and the decision is due.
  F6b (D13) and F7 dispatched in parallel: they share no files.
- **2026-07-19** — F6b (`9df0f1e8`) and F7 (`61eb605b`) landed together; both agents ran in
  parallel without collision. **All 21 convertible routes are now immersive**; only `/runs`
  and `/overview` remain, and both are deletions rather than conversions.
  F6b closed D13 more cheaply than predicted: neither the header-suppression nor the
  hero-"compact" shape was needed, because `RunDetail` and `ChatDetailDialog` supply their own
  overlay through `children` and so ignore the new prop entirely — they were structurally
  immune, not merely untouched. F7's substance was the `GateRulesSection` seam, deferred since
  F1 precisely so it could be decided once (→ D14), plus a judgement call I verified rather
  than accepted: `/gates` does **not** join the dock, because it sits in `ROUTE_ONLY_ITEMS`
  and the dock resolves through `NAV_ITEMS`, so the usual one-line `DOCK_IDS` addition would
  have silently resolved to `undefined` (→ D15). Memory's three early returns each carried
  their own header and dialogs; consolidating them also deleted a duplicate "New note" button
  that shared a `data-testid` with the header's — a latent `getByTestId` ambiguity.
  Verified independently before committing: both typechecks clean, 648 web-component tests and
  13 DS tests green.
- **2026-07-19** — F8 grounded ahead of planning; two operator calls taken (O5, O6) and four
  decisions recorded (D16, D17 are deletion blockers). The grounding changed the phase's shape
  twice over: the limits/budget workstream **evaporated** (limits already ship in `ChatTopBar`;
  budget is per-project data that was never on `/overview`), while the briefing became a
  contract change — the first time this arc touches `libs/contracts` and `apps/api`. Two
  deletion traps found that a naive `rm` would have hit: `features/overview/` holds the
  activity module that **Chat UI's own live log** imports (D16), and the API bakes `/runs?run=`
  links into persisted chat transcripts, so the route needs a redirect shim rather than a
  delete (D17).
