BATCH: web-agents

[SEVERITY: High] [FILE: apps/web/features/agents/DetailScreen.tsx:70-101] [CATEGORY: Duplication]
Own-rule editor state machine (editingRule state, saveRule closure, watchedGates/watchedGateRuleIds derivation, setGates helper) and the canSave/canCreate name+instructions validity check are duplicated verbatim in apps/web/features/agents/components/NewAgentDialog.tsx:47-74 — same ~30 lines maintained in two places.
Extract a shared hook (e.g. useAgentRuleEditor(form)) into agentEditValues.ts or a new hooks file and use it from both DetailScreen and NewAgentDialog.

[SEVERITY: Medium] [FILE: apps/web/features/agents/DetailScreen.tsx:75] [CATEGORY: Business logic in component]
The pipeline-usage filter (`pipelines.filter(p => p.phases.some(ph => ph.agent === agent.name))`) is reimplemented independently in apps/web/features/agents/Screen.tsx:55-56 (as `pipelineCount`) instead of living in one selector/util.
Extract a shared `agentPipelineUsage(pipelines, agentName)` util and reuse it in both screens.

[SEVERITY: Medium] [FILE: apps/web/features/agents/components/agentEditValues.ts] [CATEGORY: Missing test coverage]
`toFormValues`, `applyFormValues`, and `ownRuleToInitial` carry non-trivial mapping logic (empty-string→undefined normalization, gates/gateRuleIds defaulting) shared by both the detail screen and create dialog, but have no dedicated unit test file.
Add agentEditValues.test.ts covering round-trip conversion and the empty-string-to-undefined edge cases.

[SEVERITY: Low] [FILE: apps/web/features/agents/components/AgentRulesSection.tsx:34-103] [CATEGORY: Component boundaries]
GroupHeading and LinkedRuleRow are fully-fledged sub-components defined inline in the same file as the 152-line main component, pushing the file to 257 lines and mixing three concerns.
Move GroupHeading and LinkedRuleRow into their own component files under components/.

[SEVERITY: Low] [FILE: apps/web/features/agents/components/AgentRulesSection.tsx:34-44] [CATEGORY: Missing typing convention]
GroupHeading, LinkedRuleRow (same file) and ChipToggle in AgentEditBasics.tsx:18-26 type their props as inline object literals instead of a named, exported `<Component>Props` interface, diverging from the project's stated props convention.
Give each an exported `XxxProps` interface per CLAUDE.md convention.

[SEVERITY: Low] [FILE: apps/web/features/agents/components/AgentCard.tsx:39] [CATEGORY: Duplication]
The `agent.glyph as IconName | undefined ?? "bot"` cast-with-fallback pattern is repeated identically at DetailScreen.tsx:158, Screen.tsx:171 (cat.glyph), and NewAgentDialog.tsx:101 (watchedGlyph).
Add a small `toIconName(glyph, fallback = "bot")` helper and reuse it instead of re-casting at each call site.

[SEVERITY: Low] [FILE: apps/web/features/agents/components/ApprovalCard/ApprovalCard.tsx:23] [CATEGORY: Typing]
Prop type widens the contract `Approval` via an ad-hoc inline intersection (`Approval & { riskType?: string; kind?: string }`), signalling the enriched backend payload isn't fully modeled in the contracts package.
Model the enriched approval payload as a named contract/DTO type rather than an inline intersection at the component boundary.

[SEVERITY: Low] [FILE: apps/web/features/agents/components/NewAgentDialog.tsx] [CATEGORY: Missing test coverage]
NewAgentDialog (create flow + tabs), AgentRulesSection (link/unlink/add/edit/delete-rule interactions) and AgentEditBasics (field bindings, tool-toggle, glyph-picker) have no dedicated test files; only indirectly touched via DetailScreen.test.tsx/Screen.test.tsx smoke tests.
Add focused component tests for the rule-linking and tool-toggle interaction branches, which carry the most logic.

STATS: 26 files, 1816 total lines. Top 3 by size: components/AgentRulesSection.tsx (257), DetailScreen.tsx (245), Screen.tsx (211). No file in this batch exceeds 300 lines.
