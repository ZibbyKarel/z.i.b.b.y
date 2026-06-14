# Phase 39 — Decouple the shared runtime badges from the pipelines feature

> Priority axis (LOOP.md): **#3 SIMPLIFICATION** — remove a cross-feature coupling.
> (The agents detail/editor surface was audited and found solid — real RHF editor, rules
> section, view details — so no functional gap; per the Phase-38 audit-signal the loop
> takes a simplification.)

## The smell

`ModelBadge` and `ThinkBadge` — small generic runtime tags (the model name; the
thinking level) — are defined and exported from the **pipelines** feature's big
`PhaseChain.tsx`. But they're used by both features:

- pipelines: `PhaseChain`, `PipelineRunModal`, `PipelineDialog` (natural);
- agents: `AgentCard`, `AgentViewDetails` — which `import { ModelBadge, ThinkBadge }
  from "../../pipelines/components/PhaseChain"`.

So the **agents** feature reaches across into a **pipelines** component (a cross-feature
coupling), and pulls the large `PhaseChain` module in just for two tags. The badges are
domain-neutral (they render a model/thinking value), so their home shouldn't be a
pipeline component.

## Fix (no behaviour change)

- New `apps/web/components/RuntimeBadges/RuntimeBadges.tsx` (the app's neutral generic
  components dir): move `ModelBadge`, `ThinkBadge`, and the `AgentThinking → TagTone`
  helper here. Retype the props against the shared contract types — `model:
  Agent["model"]`, `level: AgentThinking` (from `@zibby/contracts`) — instead of
  `PipelinePhase["model"]`/`["thinking"]`, so the shared module has no pipeline-domain
  dependency. Same DS `Tag`, same `useTranslations("phase")` (`modelTitle`/`thinkTitle`).
- `PhaseChain.tsx`: delete the two badge defs + the tone helper; `import { ModelBadge,
  ThinkBadge }` from the shared module for its own internal use. It no longer exports them.
- Update the other call sites to import from the shared module: `AgentCard`,
  `AgentViewDetails`, `PipelineRunModal`, `PipelineDialog`.

## Tests
- New `RuntimeBadges.test.tsx`: `ModelBadge` renders the model name (e.g. "opus");
  `ThinkBadge` renders the level (e.g. "high").
- Existing `PhaseChain.test` (now importing the badges from the shared module) stays green.

## Definition of done
- `pnpm lint && pnpm typecheck && pnpm test` green; `tsc -p apps/web` clean;
  `graphify update .`; checkpoint commit (no push — PR is the gate).
