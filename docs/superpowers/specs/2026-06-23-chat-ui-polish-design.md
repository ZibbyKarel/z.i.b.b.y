# Chat UI polish — design

> Status: approved 2026-06-23 · branch `feat/chat-ui`

Four operator-requested refinements to the JARVIS-style chat overlay
(`apps/web/features/chat`, engine `apps/api/src/chat`).

## 1. Bottom-anchored conversation

The transcript should grow **upward from the composer**: the first message sits
directly above the input, new turns push older ones up. Pure CSS — the existing
scroll container (`ChatScreen.tsx`) gets a flex bottom-anchor (`mt-auto` on the
inner content / `justify-end`), no JS. Auto-scroll-to-bottom stays.

## 2. Fade before the centered logo/orb

The conversation must not visually overrun the centered ambient orb. Re-tune the
existing `maskImage` linear-gradient on the scroll container so it is fully opaque
at the bottom (near the composer) and fades to transparent as content rises toward
the orb's vertical band. Declarative mask only — **no** scroll listener setting
per-message opacity. Scrolling still reaches the whole history; content near the
orb stays ghosted even when scrolled to (matches the literal request).

## 3. Markdown rendering

Assistant text is currently interpolated raw, so `**bold**`, lists and headings
show as literal markup in one block. Add `react-markdown` + `remark-gfm` and a
feature-local `ChatMarkdown` component that maps output to DS primitives:

- fenced code → DS `CodeBlock`; inline code → `Typography mono` span
- blocks (p / strong / em / lists / headings / links) styled via a scoped
  `.chat-md` CSS block in `apps/web/app/globals.css` using theme tokens
  (Tailwind v4 preflight strips UA defaults, so spacing/markers are restored there)

Markdown renders **during streaming too** (claude.ai behaviour); an unclosed `**`
snaps to bold when the closer arrives. The streaming cursor `█` is a sibling
element, never inside the markdown string.

## 4. Selectable personality

`CHAT_PERSONA_PROMPT` today bundles **two** things: the personality/tone **and**
the answer/ask/act governor (guarded by `chat-dispatch.eval.test.ts`). Split them:

- `CHAT_GOVERNOR_PROMPT` — the decision rules + tool contract, **always** appended.
  Personas never change this.
- `CHAT_PERSONAS: Record<ChatPersona, string>` — identity + tone only. Presets:
  - **`jarvis`** (default) — current butler: warm, dry wit, Czech-primary.
  - **`concise`** — minimal words, no pleasantries, straight to the point.
  - **`formal`** — neutral, professional, no humour.
- `buildChatPrompt(persona) = `${CHAT_PERSONAS[persona]}\n\n${CHAT_GOVERNOR_PROMPT}``;
  `CHAT_PERSONA_PROMPT = buildChatPrompt("jarvis")` kept for the eval/back-compat.

Storage reuses the existing file-backed `SystemConfig` (`libs/contracts`): a new
`chatPersona` enum field, default `"jarvis"`. `ChatSessionService.buildArgs()`
reads it from the `@Global` `SystemConfigStore` at turn time (live, no restart).
A new `/settings` subsection (`ChatSection`) picks the persona and PUTs the whole
config (spreading the rest so it can't clobber the runtime knobs; `SystemSection`
likewise passes `chatPersona` through). A persona change applies to the **next**
conversation, not mid-`--resume`.

## 5. Conversation persists until "New chat"

The thread must survive closing + reopening the overlay — dipping in and out no
longer wipes it. The conversation state (the `conversationId` and the `messages`
transcript) is lifted out of `ChatScreen` (which unmounts on close) up into
`ChatProvider`, which holds it for the lifetime of the page:

- `open()` mints a `conversationId` **once** (lazily, only if none yet) and reuses
  it on every reopen — so `--resume` keeps ZIBBY's `claude` session across opens.
- A new **"New chat"** affordance in the overlay top bar (shown only once the
  transcript is non-empty) calls `newChat()`: clears `messages` and mints a fresh
  `conversationId`, starting a clean session (no `--resume`). The overlay stays open.

`ChatScreen` becomes a controlled view: `messages` + `onMessagesChange` (the lifted
setter) + `onNewChat` are props. Scope is **overlay-session** persistence (survives
close/reopen, not a full page reload) — the plain reading of the request; no
localStorage/transcript-rehydration, which would reintroduce the removed
refetch-on-done flash.

## Verification

`pnpm lint` · `pnpm typecheck` · api chat suite + web component tests. The
`chat-dispatch.eval.test.ts` import must still resolve (proves the governor split
preserved dispatch discipline).
