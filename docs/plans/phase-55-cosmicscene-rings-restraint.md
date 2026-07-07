# Phase 55 — CosmicScene: make ringsLayer less prominent, rethink the state viz (line 91)

> TODO (line 91): _"CosmicScene - ringsLayer je moc výrazná. Zkus místo toho vymyslet nějakou
> jinou variantu vizualizace stavu, které momentálně využívají rings."_

## Context

The chat `CosmicScene` renders a `ringsLayer` that is too visually prominent. The rings currently
convey some SCENE STATE (idle/running/waiting/error/etc). The operator wants a subtler alternative
visualization for whatever state the rings encode.

⚠️ `scene/ringsLayer.ts` + `scene/sceneController.ts` were operator WIP when this plan was written.
This phase runs ONLY after the operator commits them. RECON the committed state — the operator may have
already begun reworking the rings; build on that, don't revert.

## Goal

Replace/soften the prominent rings with a more restrained state visualization that still communicates
the same scene state, honoring the audit's "tichý velín" principle (color=state, glow/pulse only when
live, quiet by default). Keep the state→visual mapping legible but far less loud.

## Recon (implementer)

- Read the COMMITTED `scene/ringsLayer.ts`, `scene/sceneController.ts`, `scene/tokens.ts`,
  `scene/sceneTypes.ts`, and the `CosmicScene.stories.tsx` (Phase 37 shows all background states) to
  learn exactly which SCENE STATES the rings encode and how the controller drives them.
- Understand the canvas layering (the scene owns its backdrop; this is a real scene, not a decorative
  overlay) and how other layers (constellation, etc.) already express liveliness — the new state cue
  should harmonize with them.

## Approach

- Devise a subtler state cue for the states the rings carry: e.g. a faint radial gradient / a low-opacity
  pulse gated to live states only / a soft halo instead of hard concentric rings — pick ONE restrained
  treatment and implement it in the scene layer, driven by the same controller state input the rings used.
- Keep glow/pulse ONLY for genuinely live states (running / awaiting-approval); idle/done/error stay quiet
  per the audit. Reuse the scene's existing token palette (`scene/tokens.ts`) — don't fork colors.
- Update `CosmicScene.stories.tsx` so every state still renders and the new viz is visible across states
  (Phase 37 already enumerates them). Keep reduced-motion honored.

## Files
- `apps/web/features/chat/scene/ringsLayer.ts` (soften/replace) and/or a new subtle layer;
  `scene/sceneController.ts` (drive the new cue) — MINIMAL changes, additive where possible.
- `apps/web/features/chat/scene/CosmicScene.stories.tsx` (show the states).
- Possibly `scene/tokens.ts` / `scene/sceneTypes.ts` if a token/type is needed.

## Verification
- `npx tsc -p apps/web/tsconfig.json --noEmit` clean.
- Scoped lint: `npx eslint apps/web/features/chat/scene` (NEVER bare `pnpm lint`).
- `rtk proxy npx vitest run apps/web/features/chat` green modulo pre-existing chat reds (confirm via `git stash`).
- Manual (Storybook `CosmicScene`): the rings are no longer dominant; each state reads clearly but
  quietly; motion only when live; reduced-motion respected.

## Constraints
- No `any`, canvas draw is the one dynamic surface (this is scene code, not DOM — inline draw is fine).
  Quiet-by-default; glow/pulse only when live. Coordinate with Phase 56 (both touch the scene) — the
  dispatcher will sequence them. Don't touch non-scene operator WIP (SummaryWidget, machine.*, design/*,
  the chat data-layer files outside scene/).
