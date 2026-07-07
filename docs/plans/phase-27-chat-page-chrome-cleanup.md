# Phase 27 — Chat page is a fullscreen, coequal parallel UI to the HUD

> TODO (line 29, current text): _"na stránce chatu by se MainLayout měl lišit. Celé
> tělo chat stránky musí být fullscreen. Jedná se o 'paralelní UI s HUD UI' takže je
> rovnocenné a né vnořené do HUD UI."_

Supersedes the earlier draft of this note (which described stripping the chat top bar
and moving the "new chat" button). The current requirement is architectural: the chat
page must be **fullscreen** and **NOT nested inside the HUD's MainLayout chrome** — it's
a parallel, coequal UI to the HUD, not a screen inside it.

## Goal

On `/chat`, render the chat surface fullscreen without the HUD MainLayout (no left nav
rail, no HUD top bar / breadcrumb / right rail around it). Chat becomes a coequal
top-level UI; the HUD (dashboard) is the other. Everything else (chat streaming, palette,
composer, ⌘J entry, conversation persistence) keeps working.

## Current structure (read)

- `app/(dashboard)/layout.tsx` → `<AppShell>{children}</AppShell>`.
- `components/layout/AppShell/AppShell.tsx`:
  - `AppShell` mounts the providers: `CatalogProvider → ProjectProvider → NewTaskProvider
    → ChatProvider → <Suspense><AppShellInner/></Suspense>` (:70-88).
  - `AppShellInner` (:28-68) computes nav items / notifications / breadcrumb and renders
    the HUD **`MainLayout`** (nav rail, top bar with `chatSlot={<ChatButton/>}` +
    `projectSlot` + `taskSlot` + `walletSlot` + `railSlot`, and `{children}` in the
    content area).
- `/chat` route = `app/(dashboard)/chat/page.tsx` → `features/chat/Screen.tsx` →
  `ChatScreen` (Phase 23: its outer container is `relative flex h-full w-full flex-col`,
  filling whatever content area it's given; it has its own top bar with the palette
  SearchBar, activity toggle, "new chat", Close→/overview).

## Approach — bypass MainLayout for the chat route (keep the providers)

The providers (`ChatProvider` especially) must stay mounted for chat, so the fix lives in
`AppShellInner`, not in the route group: **when the path is `/chat`, render the children
fullscreen and skip `MainLayout` entirely.**

1. In `AppShellInner`, compute `const isChat = pathname === "/chat" || pathname.startsWith("/chat/")`.
   Put this check **before** the nav/notifications/breadcrumb computation, and early-return
   a fullscreen wrapper: `return <div className="h-dvh w-full">{children}</div>;` (or the
   DS equivalent — a `Container` sized to the viewport; respect the no-raw-inline-style
   rule, use Tailwind height classes / DS props). This gives the chat route the full
   viewport with none of the HUD chrome, while still sitting inside `AppShell`'s provider
   stack (ChatProvider/ProjectProvider/etc.).
   - Because `MainLayout` isn't rendered on `/chat`, `useNotifications()` and the nav item
     mapping don't run there — keep the early-return above those calls so no HUD-only data
     hooks fire on the chat surface.
2. Ensure the chat actually fills the viewport: `ChatScreen`'s `h-full w-full` now resolves
   against the `h-dvh` wrapper, so it fills the screen. Verify no double-scroll / the scene
   canvas + composer sit correctly at full height. Adjust the wrapper (e.g. `overflow-hidden`)
   if needed.
3. Keep the chat's own top bar as its chrome — it's now the chat UI's own frame (palette,
   activity, new-chat, and **Close → /overview** which is the way back to the HUD). Do NOT
   remove it (that was the superseded draft). The ChatButton in the HUD top bar and the ⌘J
   shortcut (ChatContext) remain the entries INTO chat from the HUD; they're unaffected
   because ChatProvider still mounts.
4. Leave the `/chat` nav entry (Phase 23, `state/config.ts`) as-is — it's a valid entry
   point; it just navigates into the fullscreen chat. (Its rail highlight won't show while
   on `/chat` since the rail isn't rendered there — that's expected for a parallel UI.)

Route placement stays under `(dashboard)` (so `AppShell`'s providers still wrap it); the
"un-nesting" is achieved by AppShellInner not wrapping the chat route in MainLayout. This
is the minimal, low-risk way to satisfy "fullscreen, MainLayout differs, not nested."

## Files touched
- `apps/web/components/layout/AppShell/AppShell.tsx` (AppShellInner early-return for /chat)
- maybe `apps/web/features/chat/components/ChatScreen.tsx` / `features/chat/Screen.tsx`
  (height wrapper tweak so it fills `h-dvh`)
- tests: `AppShell` test (assert the chat route renders without MainLayout chrome); adjust
  any ChatScreen test that assumed a constrained container.

## Verification
- `pnpm typecheck` / scoped `pnpm lint` (never bare) / `pnpm test` green modulo known
  pre-existing failures (confirm via `git stash`).
- Run the app: `/chat` fills the whole viewport with NO nav rail / HUD top bar; the chat's
  own top bar + composer + scene render at full height; Close / ⌘J return to the HUD;
  navigating HUD→chat→HUD preserves the conversation (ChatProvider persists in AppShell).
- Other dashboard routes still render inside MainLayout unchanged.

## Out of scope
- Composer/CommandLine restyle; chat visual redesign beyond going fullscreen.
