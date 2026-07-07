# Phase 58 — Chat ⌘K opens the selected result's DETAIL dialog, not just inject into the input (line 97)

> TODO (line 97): _"Chat UI - musím být schopný přes cmd-k zkratku si zobrazit detail vybraného
> výsledku v dialogu a né ho jen přidat do kontextu inputu dole (tohle chování je duplicitní s
> inline searchem komponenty CommandLine)."_

## Context

In chat, the ⌘K palette (`ChatPalette`, a DS `SearchMenu` quick-switcher) currently injects the selected
result into the CommandLine input's context (via the `injectedTarget` prop). The operator says that
duplicates the CommandLine inline `@`-search (Phase 45/51) and instead wants ⌘K to OPEN the selected
result's DETAIL in a dialog.

⚠️ Chat files were operator WIP when written. Runs AFTER the operator commits the chat refactor. RECON the
committed state (the palette/injection wiring may have moved in the refactor).

## Goal

⌘K in chat → pick a result → its DETAIL opens in a dialog (agent/pipeline/task/run detail as appropriate),
rather than being added to the input context. The input-injection role is owned by CommandLine's inline
`@`-search now, so ⌘K stops duplicating it.

## Recon (implementer)

- Read the COMMITTED chat ⌘K wiring: the `ChatPalette` (uses DS `SearchMenu`), the ⌘K listener in
  `ChatScreen`, and how it currently calls `openPalette`/sets `injectedTarget` on CommandLine (Phase 30/38).
- Identify what "detail" means per result type and whether a reusable detail dialog/view exists for
  agents/pipelines/tasks (e.g. an entity detail dialog, `EntityHero`-based profile, or the run detail).
  Prefer reusing an existing detail surface over building a new one.

## Approach

- Change the ⌘K result-selection handler: instead of `injectedTarget`→CommandLine, open a DIALOG showing
  the picked result's detail. Reuse an existing detail component/route if one fits (e.g. open the entity's
  detail dialog, or navigate to its detail page if a dialog is overkill — but the operator asked for a
  DIALOG, so prefer an in-place DS `Dialog`). Keep the palette's search/keyboard UX (DS SearchMenu).
- Remove the now-duplicated input-injection path from ⌘K (the CommandLine inline `@`-search remains the way
  to add a target to the input). Ensure the ⌘K shortcut still works on /chat (Phase 30) and doesn't
  conflict with CommandLine's own handlers.
- i18n for any dialog chrome (cs+en).

## Files
- `apps/web/features/chat/components/ChatPalette*.tsx` (or wherever the ⌘K result handler lives) + `ChatScreen.tsx`.
- Reused detail dialog component (existing) — new file only if none exists.
- Tests: ⌘K → select → detail dialog opens (not input injection); shortcut still bound.
- i18n `apps/web/i18n/messages/{cs,en}.json` if needed.

## Verification
- `npx tsc -p apps/web/tsconfig.json --noEmit` clean.
- Scoped lint: `npx eslint apps/web/features/chat`.
- `rtk proxy npx vitest run apps/web/features/chat` green (your tests; note operator mid-refactor reds).
- Manual: on /chat, ⌘K → type → Enter opens the result's detail in a dialog; nothing is injected into the
  input; CommandLine's own `@`-search still injects targets as before.

## Constraints
- React 19 (NO forwardRef), no `any`, no raw inline DOM `style`; dialogs are for viewing here (DS `Dialog`).
  Reuse an existing detail surface if possible. Sequenced with Phase 57 (both chat / ChatScreen);
  dispatcher orders them so they don't collide on ChatScreen. Don't touch non-chat operator WIP.
