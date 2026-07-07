# Phase 37 — Storybook for the chat UI background/scene states

> TODO (line 59): _"k chat UI musíme vytvořit storybook. Rád bych viděl všechny možné
> stavy 'pozadí' chatu."_

## Goal

A Storybook story set for the chat UI's **background** (the CosmicScene backdrop) so the
operator can see every possible scene state at a glance — one story per mode/state.

## Recon (implementer explores)

- Storybook setup: this repo runs `pnpm storybook` (DS at :6006). Find whether `apps/web`
  feature components are already included in Storybook (memory: "monorepo storybook
  aliases"; DS components have `*.stories.tsx`). Check `.storybook/` config (main.ts
  `stories` globs) — confirm whether `apps/web/**/*.stories.tsx` is picked up; if not,
  either add the glob or place the story where the config already scans (match how any
  existing app-level story is wired, if one exists).
- The scene + its states: `apps/web/features/chat/scene/CosmicScene.tsx` takes a `mode`
  (and `streamChars`, `completedTick`, etc.). Find the full set of scene MODES (the union
  driving the backdrop — e.g. idle/listening/thinking/working/error/…; `ChatScreen`'s
  `MODE_DOT` map and the mode type are the source). Also note other "background" variables
  that change the look (streaming activity, reduced-motion).

## Approach

- Add `apps/web/features/chat/scene/CosmicScene.stories.tsx` (or a `ChatBackground` wrapper
  story) with **one story per scene mode**, plus stories for the notable background
  variations (streaming/active vs idle, reduced-motion). Each story renders the scene in a
  full-bleed dark frame sized like the chat surface so the backdrop is visible.
- Provide the props the scene needs (a minimal roster of agents/pipelines for the
  constellation, a fixed `mode`, deterministic `streamChars`). Since Storybook has no live
  chat stream, feed static props; if the scene needs a provider/tokens context, wrap it in
  the DS `DesignSystemProvider theme="dark"` (match how DS stories wrap).
- If rendering the full `ChatScreen` in Storybook is cheap (mock `useChat`/queries), a
  couple of ChatScreen-level stories (empty greeting vs an active conversation) are a nice
  bonus — but the PRIMARY ask is the scene/background states, so prioritize
  `CosmicScene` mode stories; add ChatScreen stories only if low-effort.
- Use the Storybook controls/args so the operator can also flip mode live from the
  Controls panel.

## Files (expected)
- `apps/web/features/chat/scene/CosmicScene.stories.tsx` (new)
- `.storybook/main.*` (only if the stories glob must be extended to include apps/web)
- a tiny fixture for the constellation roster if needed

## Verification
- `pnpm storybook` builds and the chat background stories render (each mode shows a
  distinct backdrop). Or `pnpm build-storybook` if a headless check is preferred.
- `pnpm typecheck` clean; scoped lint on the new story file (never bare `pnpm lint`).
- No new failures in `pnpm test` (stories aren't tests, but the story file must typecheck/lint).

## Constraints
- No forwardRef, no `any`, no inline DOM `style` beyond the story's frame (a story wrapper
  may use a DS Container / a documented style for the full-bleed dark frame). Match the DS
  stories' format/CSF3. Don't touch the operator's WIP (machine.*, SummaryWidget, design/*).
