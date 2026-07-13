BATCH: web-subsystems

[SEVERITY: Medium] [FILE: apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx:141-322] [CATEGORY: file-size]
Component file is 322 lines, mixing the hero band (image/gradient rendering, close button, identity block), tab-shell composition, and two lifecycle effects (seen-tracking, Escape handling, focus management) in one function.
Split the hero band (image + close button + name/tagline/mandate/status block) into a `SubsystemDrawerHeader` subcomponent, keeping `SubsystemDrawer` as the composition root.

[SEVERITY: Medium] [FILE: apps/web/features/subsystems/components/SubsystemDrawer/RosterTab.tsx:1-304] [CATEGORY: file-size]
File is 304 lines and combines the pure fit-to-view geometry math (`computeFitTransform`), a `ResizeObserver`-driven canvas subcomponent, and the tab's own pipeline/chain listing + dialog wiring.
Move `computeFitTransform` (and its `FitTransform`/constants) into a sibling geometry-only util file, mirroring the `SubsystemWeb/particle-mapping.ts` precedent already used elsewhere in this feature.

[SEVERITY: Medium] [FILE: apps/web/features/subsystems/components/SubsystemDrawer/RosterTab.tsx:85-105] [CATEGORY: business-logic-in-component]
`computeFitTransform` is real, non-trivial geometry logic (bbox, scale, centering) defined directly inside a component file rather than a dedicated, non-React util module, unlike this feature's own `particle-mapping.ts`.
Extract to a pure util file (e.g. `roster-canvas-fit.ts`) so it's imported rather than co-located with rendering code.

[SEVERITY: Medium] [FILE: apps/web/features/subsystems/components/SubsystemDrawer/ArtefaktyTab.tsx:65-95] [CATEGORY: business-logic-in-component]
`nextStepPipelineId` and `consumerSubsystemName` implement chain-traversal/derivation logic (walking `chains[].steps` to resolve an artifact's downstream consumer) inline in the component file instead of a testable util module.
Move both functions to a util (e.g. `artefakty-derivation.ts`) alongside `particle-mapping.ts`'s pattern for pure, unit-testable logic.

[SEVERITY: Medium] [FILE: apps/web/features/subsystems/components/SubsystemDrawer/AktivitaTab.tsx:113-114] [CATEGORY: duplication]
The `ago` relative-time translator closure is defined byte-identically in `ArtefaktyTab.tsx:249-250` — same three-branch logic (agoNow/agoM/agoH) duplicated verbatim across two files in this batch.
Extract one shared `useRunAgoFormatter()` (or plain util taking `tRuns`) and import it from both tabs.

[SEVERITY: Medium] [FILE: apps/web/features/subsystems/components/SubsystemDrawer/RosterTab.tsx:222-223] [CATEGORY: duplication]
The `list.filter((x) => x.ownerSubsystem === subsystem.id)` pattern for pipelines/chains is reimplemented independently in `RosterTab.tsx` (pipelines+chains), `AktivitaTab.tsx:96-101` (pipeline/chain id sets), `ArtefaktyTab.tsx:223` (pipelines), and `GatesTab.tsx:217` (rules) — four near-identical ownership filters with no shared helper.
Add a shared selector/hook (e.g. `useOwnedPipelines(subsystemId)` / `useOwnedChains(subsystemId)`) so the ownership contract lives in one place.

[SEVERITY: Low] [FILE: apps/web/features/subsystems/components/SubsystemDrawer/AktivitaTab.tsx:93] [CATEGORY: duplication]
`const [now] = useState(() => Date.now())` with the identical "render-stable now" comment is repeated in `ArtefaktyTab.tsx:217`.
Factor into a shared `useStableNow()` hook used by both tabs.

[SEVERITY: Low] [FILE: apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx:165-179] [CATEGORY: duplication]
Raw `document.addEventListener("keydown", …)` Escape handling plus manual focus-save/restore reimplements an a11y idiom the DS `Dialog` already owns, and the same ad-hoc pattern recurs in `ChatDetailDialog.tsx`, `ChatPalette.tsx`, `ChatScreen.tsx`, and `CommandLine.tsx` (outside this batch) — five independent implementations of the same behavior project-wide.
Extract a shared `useEscapeKey`/`useFocusTrap` hook (could live in DS or a shared web hook) rather than each consumer wiring its own listener.

[SEVERITY: Low] [FILE: apps/web/features/subsystems/components/SubsystemDrawer/GatesTab.tsx:1-248] [CATEGORY: composition]
File hosts three fairly distinct concerns — mad-libs sentence rendering (`GateRuleSentenceRow`), the per-project autopilot dial (`ProjectAutopilotRow`/`AutopilotSummary`/`hasAutonomyPolicy`), and the tab shell hosting `GateRulesSection` — all as local functions in one file. Under the 300-line threshold today but trending up.
Consider splitting `GateRuleSentenceRow` and the `AutopilotSummary` family into sibling files before the tab grows further.

STATS: files=16, total lines=2847, top 3 largest: SubsystemDrawer.tsx (322), RosterTab.tsx (304), ArtefaktyTab.tsx (300).
No `any`, `@ts-ignore`/`@ts-expect-error`, or unsound `as` casts found in this batch (all `as Route` uses are the project's standard Next.js typed-route idiom). Query/mutation hooks are clean and follow conventions. Test coverage across all five tab/component files is thorough.
