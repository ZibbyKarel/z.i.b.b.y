BATCH: web-pipelines

[SEVERITY: High] [FILE: apps/web/features/pipelines/components/PipelineDialog/PipelineCanvas.tsx:190-231] [CATEGORY: Performance]
Global `mousemove`/`mouseup` effect lists `graph` in its dep array (needed only so `commit`'s closure sees fresh state for `isUpstreamRework`), so during every node-drag frame `setGraph` mutates `graph` → the effect tears down and re-attaches both window listeners on each mouse move. Listener churn + full re-subscribe per frame.
Doporučení: Keep `graph`/`pending` in refs read inside the handlers and depend only on `pending`/`nodeDrag` booleans so listeners attach once per drag gesture.

[SEVERITY: High] [FILE: apps/web/features/pipelines/Screen.tsx:117-137] [CATEGORY: Duplication]
The save/diff logic (call `graphToPhases`, rebuild `initialPhases` via `graphToPhases(phasesToGraph(...))`, `JSON.stringify` compare, assemble the `UpdatePipelineInput` patch with name/desc trims) is duplicated almost verbatim in `PipelineDialog.tsx:104-110`. Two copies of the same non-trivial patch-building business logic will drift.
Doporučení: Extract a pure `buildPipelinePatch(initial, graph, name, desc, agents)` util next to `pipeline-graph.ts` and call it from both.

[SEVERITY: High] [FILE: apps/web/features/pipelines/Screen.tsx:76-137] [CATEGORY: Business logic in component]
Screen embeds a full inline-edit state machine (editingId/editGraph/editName/editDesc/showPalette + startEdit/cancelEdit/addAgentToEdit/saveEdit and validity/canSave derivation) directly in the component, on top of query/loading/error branches and avatar/duplicate mutations — driving the 431-line size.
Doporučení: Move the edit lifecycle into a `usePipelineInlineEdit(selected, agents)` hook returning graph/name/desc/handlers, leaving Screen as presentation.

[SEVERITY: Medium] [FILE: apps/web/features/pipelines/components/PipelineDialog/PipelineCanvas.tsx:1-441] [CATEGORY: Component size]
441 lines: geometry helpers (portPt/flowPath/reworkPath), ~10 graph-mutation closures (delNode/cycleModel/setProduces/patchRework/…), drag/port mouse handlers, the commit reducer, and three SVG+DOM render passes all in one component.
Doporučení: Split the graph-mutation closures into a `usePipelineGraphMutations(setGraph)` hook and the SVG edge layer (`flow`/`rework`/pending paths) into a `<CanvasEdges>` subcomponent.

[SEVERITY: Medium] [FILE: apps/web/features/pipelines/components/PipelineDialog/PipelineCanvas.tsx:347-374] [CATEGORY: Performance]
`AgentNode` is not memoized, and per render the canvas rebuilds `reworkByFrom` (new Map) and calls `nodeById` (linear `find`) + `hasOutgoing` (linear `some`) inside each `.map`, i.e. O(n²) per render — and it re-renders on every mousemove while an edge is being dragged (pending.cursor updates). Every node re-renders each frame.
Doporučení: `memo` AgentNode, precompute an id→node Map and an outgoing set once per render, and isolate the pending-cursor preview so node cards don't re-render during a drag.

[SEVERITY: Medium] [FILE: apps/web/features/pipelines/components/PipelineDialog/AgentNode.tsx:258-265] [CATEGORY: Convention/Tailwind]
Raw `<input>` carries bespoke app-authored Tailwind classes incl. arbitrary values (`text-[10px]`, `focus-visible:ring-accent`); same pattern in `EdgeControls.tsx` (inputs, `STEP`, delete buttons) and `PipelineDialog.tsx:169,177` (name/desc inputs with `bg-[var(--color-background-deep)]`). CLAUDE.md states apps/web must not write its own Tailwind classes / compose from DS primitives.
Doporučení: Replace with a DS text-input primitive (or a small DS "canvas inline input" component) so styling lives in the design system, not arbitrary app utilities.

[SEVERITY: Medium] [FILE: apps/web/features/pipelines/components/PipelineDialog/PipelineDialog.tsx:72-80] [CATEGORY: Duplication]
`addAgent` (find agent → `makeNode(agent, i+1, x ?? 60 + i*26, y ?? 150 + i*18)` → append) is duplicated in `Screen.tsx:105-114` as `addAgentToEdit`, including the identical fallback-position magic numbers.
Doporučení: Move to a shared helper `appendAgentNode(graph, agents, agentId, x?, y?)` in the graph module.

[SEVERITY: Low] [FILE: apps/web/features/pipelines/components/PipelineDialog/AgentNode.tsx:23-53] [CATEGORY: Prop drilling]
AgentNode takes ~18 props, ~10 of them individual callbacks drilled straight from PipelineCanvas (onPortDown/onNodeDown/onDelete/onCycleModel/onCycleThink/onSetProduces/onPortEnter/…).
Doporučení: Group the wiring callbacks into a single `handlers` object (or a small context) to shrink the surface and reduce churn.

[SEVERITY: Low] [FILE: apps/web/features/pipelines/components/PipelineDialog/AgentNode.tsx:58] [CATEGORY: Typing]
`agents.find(...)?.glyph as IconName` casts an unvalidated string to the DS `IconName` union (also in `AgentPalette.tsx:32` and `glyphForPhase` usage); a bad stored glyph silently becomes an invalid icon name with no fallback narrowing.
Doporučení: Validate against the known icon set (or a typed lookup) instead of `as IconName`, or keep the `?? "bot"` fallback behind a guard that also catches unknown names.

[SEVERITY: Low] [FILE: apps/web/features/pipelines/components/PipelineDialog/AgentNode.tsx:55-58] [CATEGORY: Duplication]
`glyphOf` exists here and a near-identical `glyphOf` in `AgentPalette.tsx:32`; both resolve an agent's glyph with a `"bot"` fallback.
Doporučení: Export one `agentGlyph(agent)` helper and reuse.

[SEVERITY: Low] [FILE: apps/web/features/pipelines/components/PipelineDialog/pipeline-graph.ts:86-88] [CATEGORY: Correctness]
`guid` relies on a module-level mutable `_gid` counter shared across all canvas instances and never reset; safe today only because ids are used within one edit session and phases-diff ignores edge ids, but it makes ids non-deterministic and test-order-sensitive.
Doporučení: Fine as-is, but document the "session-unique, not persisted" contract at the call sites, or scope the counter per graph instance to avoid future cross-instance surprises.

STATS:
Files: 28 (7 test/spec files read only cursorily). Total lines: 3257.
Top 3 by lines (non-test source): PipelineCanvas.tsx (441), Screen.tsx (431), pipeline-graph.ts (313).

Note on quality: `pipeline-graph.ts` is well-factored — pure, dependency-free, side-effect-free, with a dedicated 298-line test covering ordering, consumes-threading, upstream-rework and validation; the graph⇄phases conversion is correct given the enforced one-out/one-in invariant. The mutations/queries layer cleanly follows the project's TanStack conventions (per-domain hooks, `getXxxQueryKey`, `select: selectApiResponseBody`, SSE-gated fallback polling) with no issues found. No `any`, no `@ts-ignore`/`@ts-expect-error` anywhere in the batch.
