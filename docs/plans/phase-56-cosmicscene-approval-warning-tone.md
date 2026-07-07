# Phase 56 — CosmicScene: distinguish error from awaiting-approval (approval = warning tone) (line 93)

> TODO (line 93): _"CosmicScene - Error stav a stav waiting for aprooval je poměrně stejný.
> Waiting for approval bych dal jako 'warning tone'."_

## Context

In the chat `CosmicScene`, the ERROR state and the AWAITING-APPROVAL (waiting-for-approval) state look
too similar. The operator wants awaiting-approval rendered in a WARNING tone (distinct from error's bad
tone), matching the app's 4-state palette (ok/run/wait/bad) where `wait` is the warning tone.

⚠️ `scene/sceneController.ts` + `scene/ringsLayer.ts` were operator WIP when written. Runs AFTER the
operator commits. RECON committed state first.

## Goal

Awaiting-approval reads as a WARNING/`wait` tone in the scene; error stays the `bad`/error tone — the two
are visually distinct. Aligns with the shared 4-state color semantics (`run.ts` runStateTone: ok/run/
wait/bad) so the scene doesn't invent its own mapping.

## Recon (implementer)

- Read the COMMITTED `scene/sceneController.ts`, `scene/tokens.ts`, `scene/sceneTypes.ts`: how scene
  state maps to color, and where error vs awaiting-approval currently resolve to (near-)identical tones.
- Cross-check the canonical state tones (`apps/web/features/runs/run.ts` runStateTone / the DS state
  tokens) so the scene's `wait` = the same warning tone used elsewhere; `bad` = error.

## Approach

- In the scene's state→tone mapping, give awaiting-approval the `wait`/warning tone and keep error on
  `bad`, using the scene token palette (`scene/tokens.ts`) — reuse the existing warning token; don't fork
  a new color. If Phase 55 reworked the rings into a subtler cue, apply the tone distinction to whatever
  cue now carries state (coordinate: Phase 55 and 56 both touch the scene; the dispatcher sequences them,
  so build on 55's committed result).
- Update `CosmicScene.stories.tsx` so the awaiting-approval and error states are both shown and visibly
  differ.

## Files
- `apps/web/features/chat/scene/sceneController.ts` (tone mapping) and/or `scene/tokens.ts`.
- `apps/web/features/chat/scene/CosmicScene.stories.tsx`.

## Verification
- `npx tsc -p apps/web/tsconfig.json --noEmit` clean.
- Scoped lint: `npx eslint apps/web/features/chat/scene`.
- `rtk proxy npx vitest run apps/web/features/chat` green modulo pre-existing chat reds (confirm via `git stash`).
- Manual (Storybook): awaiting-approval is a warning tone, clearly different from the error state.

## Constraints
- No `any`. Reuse the shared state palette (`wait`=warning, `bad`=error) — no forked colors. Sequenced
  AFTER Phase 55 (both scene). Don't touch non-scene operator WIP (SummaryWidget, machine.*, design/*,
  chat data-layer outside scene/).
