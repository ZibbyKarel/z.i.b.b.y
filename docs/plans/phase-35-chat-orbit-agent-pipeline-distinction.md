# Phase 35 — Visually distinguish agents vs pipelines on the chat orbit

> TODO (line 57): _"chat ui - musíme nějak vizuálně odlišit agenty a pipeliny, které
> jsou na orbitě. Pipeliny by měly být určitě výraznější než agenti."_

## Goal

In the chat cosmic scene, the orbiting entities (agents, pipelines, chains) currently
read the same. Make **pipelines visibly more prominent than agents** — the operator
should be able to tell the two kinds apart at a glance, with pipelines the stronger
visual.

## Where (recon target — the implementer explores)

The chat scene lives in `apps/web/features/chat/scene/` — `CosmicScene.tsx`,
`sceneController.ts`, `constellation.ts` (the orbiting "constellation" of entities),
`dock.ts`, plus tokens. The constellation is fed the roster of pinned/available
agents+pipelines+chains (Phase from the chat roster work — "pin-first, image-preferring
constellation roster"). Find where each orbiting node is drawn (its size/radius, color,
glow, label, glyph/avatar) and where the node's kind (agent vs pipeline vs chain) is
available.

## Approach

- Thread the entity **kind** (agent / pipeline / chain) into the constellation node
  rendering if it isn't already.
- Make **pipelines the more prominent** mark. Options (pick what fits the scene's visual
  language, combine as needed): larger node radius, stronger glow/opacity, a distinct
  accent (the pipeline "push"/purple risk tone already used elsewhere for pipelines — cf.
  velin-b's `@pipeline` = push and RunStateBadge/Tag usage), a ring/halo, or a different
  node shape. Agents stay the quieter/smaller mark. Chains: treat as at least as prominent
  as pipelines (a chain is a composition) or give them their own subtle marker — keep it
  consistent, but the explicit ask is pipelines > agents.
- Keep it token-driven and consistent with the app's kind→color vocabulary (agent =
  accent/neutral, pipeline = push/purple), and respect prefers-reduced-motion (no new
  pulsing that ignores it).

## Files (expected)
- `apps/web/features/chat/scene/constellation.ts` (node size/color/glow by kind)
- possibly `CosmicScene.tsx` / `sceneController.ts` (if kind must be threaded through) /
  the scene tokens file.

## Verification
- `pnpm typecheck`, scoped lint (`npx eslint apps/web/features/chat` — never bare
  `pnpm lint`), `pnpm test` green modulo known pre-existing failures (confirm via
  `git stash`; the 2 machine.service.ts errors are operator WIP).
- Run the app `/chat` and confirm pipelines read as clearly more prominent than agents on
  the orbit (screenshot if feasible; don't get stuck on dev-server flakiness).

## Constraints
- No forwardRef, no `any`, no inline DOM `style` (the scene canvas is the one legit
  dynamic-draw surface — it already draws to canvas/WebGL, which is fine; don't add inline
  styles to React DOM nodes). Don't touch the operator's WIP (machine.*, SummaryWidget,
  design/*).
