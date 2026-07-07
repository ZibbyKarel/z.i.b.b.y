# Phase 23 — Chat UI as a standalone page (not an overlay)

> TODO: _"převést Chat UI na samostatnou stránku místo toho aby to byl jen Overlay"_

## Goal

Turn the full-screen Chat **overlay** into a normal routed **page** at `/chat` that
lives inside the dashboard `AppShell` (nav rail + top bar around it), instead of a
`fixed inset-0 z-50` takeover mounted by a provider's `isOpen` flag. All chat
functionality (streaming, composer, palette, side panel, target identity, run cards,
decorative scene) must keep working.

## Current state (recon)

- `apps/web/features/chat/ChatContext.tsx` — `ChatProvider` owns overlay open-state
  (`isOpen`, `open/close/toggle`, ⌘J shortcut at `:11,:59-71`) **and** conversation
  state (`conversationId`, `messages`, `:34-37`) — the latter lifted here so it
  survives the overlay unmounting on close. `useChat()` at `:91-95`.
- `apps/web/features/chat/components/ChatScreen.tsx` — the overlay surface:
  - `:362-372` outer `<div role="dialog" className="fixed inset-0 z-50 flex flex-col overflow-hidden ...">` + radial backdrop + `v-mode-in` entry anim.
  - Esc-to-close (`:242-257`), capture-phase ⌘K suppression (`:267-277`), palette
    nav does `router.push(href); onClose()` (`:227-236`).
  - Renders `CosmicScene` (`:453-460`), `ChatSidePanel` + `ChatPalette` (`:522-529`).
- `apps/web/components/layout/AppShell/AppShell.tsx` — mounts `<ChatProvider>` (`:79`)
  and passes `chatSlot={<ChatButton />}` into the top bar (`:57`). Active nav derived
  from first path segment via `pathnameToNavId` (`:23-26`) — auto-handles any id in
  `NAV_IDS`.
- `apps/web/features/chat/components/ChatButton.tsx` — calls `useChat().toggle`.
- `apps/web/state/config.ts:22-35` — `NAV_ITEMS` (`{id,glyph,href}`); `NavId` union
  derived (`:58-61`); `ROUTE_ONLY_ITEMS` (`:48-50`) for routable-but-hidden screens.
- Transport is route-agnostic: `hooks/useChatStream.ts` (SSE `/api/chat/stream`),
  `mutations/useSendChatMessageMutation.ts` (`POST /api/chat/messages`). No server /
  `/api/chat/mcp` changes needed.

## Approach

Keep `ChatProvider` where it is (still a convenient owner of `conversationId` /
`messages`, and its `open/close/toggle`/`isOpen` become navigation helpers), but
**stop gating rendering on `isOpen`**. The `/chat` route renders the chat surface;
"opening" the chat = navigating to `/chat`.

### 1. New route
- `apps/web/app/(dashboard)/chat/page.tsx` — thin page rendering the chat surface
  component (mirror the `agents/page.tsx` pattern: `export default function ChatPage(){ return <ChatScreen /> }` — where `ChatScreen` is the refactored, non-overlay version).

### 2. `ChatScreen` → page surface (de-overlay)
- Replace the outer `fixed inset-0 z-50` dialog container with a normal flowing
  container that fills the AppShell content area (full height/width of the content
  region, `flex flex-col`, its own `overflow` handling) — **no** `position: fixed`,
  no `role="dialog"`, no radial full-viewport backdrop takeover, no `v-mode-in`
  entry animation. (Respect the no-inline-`style` rule: use DS `Container` props /
  Tailwind classes, and the DS `style` passthrough only for genuinely dynamic values
  like the scene canvas.)
- Keep `CosmicScene`, `ChatSidePanel`, `ChatPalette`, composer, transcript, run cards
  — all functionality intact; only the chrome/positioning changes.
- Esc-to-close (`:242-257`): as a page there's nothing to close — remove the
  close-on-Esc, but keep Esc handling that closes the **palette/side panel** if those
  sub-overlays are open (scope Esc to sub-overlays only).
- Capture-phase ⌘K suppression (`:267-277`): removed — it existed only because the
  overlay sat over the live TopBar; on a dedicated route the global ⌘K search is fine.
- Palette navigation (`:227-236`): `router.push(href)` stays; the `onClose()` call
  becomes a no-op (drop it) since navigating away already leaves `/chat`.

### 3. `ChatContext` open/close → navigation
- `open()` / `toggle()` → `router.push('/chat')`; `close()` → `router.back()` or
  `router.push('/overview')` (pick back-nav; simplest is push to the previous
  dashboard route — use `router.push('/overview')` as a safe default if no history).
- Keep the ⌘J global shortcut but make it navigate to `/chat` instead of toggling an
  overlay. Remove `isOpen` gating of any mounted `<ChatScreen/>` in the provider
  (`ChatContext.tsx:78-86` — the provider no longer mounts ChatScreen; the route does).
- Keep `conversationId` / `messages` / `newChat` state in the provider (persists
  across navigation because the provider lives in AppShell above the route).

### 4. Nav + trigger
- Add a nav entry so `/chat` is reachable and highlights in the rail:
  `state/config.ts` `NAV_ITEMS` → add `{ id: "chat", glyph: "bot", href: "/chat" }`
  (or a more fitting glyph such as `"message-circle"`/`"sparkles"` if it exists in the
  icon set — verify the glyph name is valid). Ensure `NavId`/`NAV_IDS` picks it up.
- `ChatButton.tsx` — change from `useChat().toggle` to navigating to `/chat`
  (Next `Link` or `router.push('/chat')`). Keep it in the top-bar `chatSlot`, OR drop
  it in favor of the nav entry — **keep the button** for discoverability, just make it
  navigate.
- i18n: add `nav.chat` label to `apps/web/i18n/messages/{cs,en}.json`.

## Files touched
- `apps/web/app/(dashboard)/chat/page.tsx` (new)
- `apps/web/features/chat/components/ChatScreen.tsx` (de-overlay)
- `apps/web/features/chat/ChatContext.tsx` (open/close → navigation, drop isOpen mount)
- `apps/web/features/chat/components/ChatButton.tsx` (navigate to /chat)
- `apps/web/components/layout/AppShell/AppShell.tsx` (provider stays; verify chatSlot)
- `apps/web/state/config.ts` (nav entry)
- `apps/web/i18n/messages/{cs,en}.json` (nav.chat label)

## Verification
- `pnpm lint && pnpm typecheck && pnpm test` green.
- Navigating to `/chat` shows the chat inside the app shell (nav rail visible), not a
  full-viewport takeover. ⌘J and the top-bar button both navigate to `/chat`. The nav
  rail highlights "chat" on that route. Streaming a message still works; palette (⌘K
  inside chat) and side panel still open/close. Leaving `/chat` and returning preserves
  the conversation (provider-held state).
- No dangling references to the removed `isOpen`-mounted overlay / removed props.

## Out of scope
- The CommandLine composer redesign (separate TODO / later phase).
- Visual restyle of the chat beyond removing overlay chrome (design-audit phases).
