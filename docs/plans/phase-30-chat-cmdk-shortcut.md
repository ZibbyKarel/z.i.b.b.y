# Phase 30 — Restore ⌘K on the /chat page (opens the chat palette)

> TODO (line 31): _"na stránce /chat nefunguje cmd+k zkratka"_

## Why it broke

Phase 23 (chat → routed page) removed the ⌘K listener from `ChatScreen` entirely
(its deviation 3), because at the time the chat sat over the live HUD TopBar and a
⌘K there would open BOTH the in-chat palette and the dashboard's global ⌘K search.
Phase 27 then made `/chat` fullscreen and bypassed `MainLayout`, so on `/chat` there
is now NO HUD global-search ⌘K handler at all — meaning ⌘K does nothing on the chat
page. Re-adding a ⌘K listener that opens the chat palette is now safe (no double-open).

## Fix

In `apps/web/features/chat/components/ChatScreen.tsx`, add a `keydown` listener
(effect) that, on `(e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k"`, calls
`openPalette()` and `e.preventDefault()` (and does nothing / closes if the palette is
already open, matching the palette's own toggle semantics). Use the existing
`openPalette` / `paletteOpen` state already in the component (the SearchBar click path
still uses it). Bubble-phase listener is fine now (no competing global handler on the
fullscreen route); no capture-phase suppression needed.

Keep the SearchBar click entry working. Respect reduced-motion / existing Esc handling
(Esc still closes the palette).

## Files
- `apps/web/features/chat/components/ChatScreen.tsx`
- `apps/web/features/chat/components/ChatScreen.test.tsx` — add a test: pressing ⌘K on
  the chat surface opens the palette (`ChatPalette` visible); Esc closes it. (Phase 23
  had removed the shortcut test; restore an equivalent.)

## Verification
- `pnpm typecheck`, scoped lint (`npx eslint apps/web/features/chat` — never bare
  `pnpm lint`), `pnpm test` green modulo known pre-existing failures (confirm via
  `git stash`).
- Manual: on `/chat`, ⌘K (Ctrl+K) opens the palette; Esc closes it; SearchBar click
  still opens it.
