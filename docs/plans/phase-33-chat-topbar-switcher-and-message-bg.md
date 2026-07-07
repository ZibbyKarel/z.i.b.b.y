# Phase 33 — Chat: project switcher in the top bar + color-coded message backgrounds

Two small chat-UI tweaks, batched (same files region) so they don't step on each other.

## Part 1 (TODO line 51) — project switcher in the chat top bar

> _"v chat ui mi chybí přepínátko projektů - dejme do topbaru"_

Chat is fullscreen (Phase 27) with its own top bar in `ChatScreen`, but it still sits
inside `AppShell`'s providers (`ProjectProvider` is mounted there), so
`useActiveProject()` works on `/chat`. Add the existing `ProjectSwitcher`
(`apps/web/features/projects/components/ProjectSwitcher.tsx`) into the chat top bar
(`ChatScreen.tsx`, the top-bar `Stack` around lines 370-424 — the right cluster next to
the SearchBar / activity / new-chat / close controls, or the left cluster near the mode
label; pick the placement that reads cleanly). It shares the app scope, so switching the
project in chat updates the same active-project cookie the HUD uses.

- Import `ProjectSwitcher` from `../../projects` (or the barrel) and render it in the top
  bar. Keep its existing `size="sm"`. No new state — it's self-contained.

## Part 2 (TODO line 55) — color-coded message backgrounds instead of a per-message author header

> _"chat ui - místo psaní 'Zibby' s buřinkou nad každou zprávou, kterou ZIBBY psal jen
> barevně oddělíme pozadí zpráv"_

Today each assistant turn is labelled with a "Zibby" author header + the `butlerSign`
(bowler-hat) glyph. Replace that per-message author affordance with a **background-color
distinction**: assistant (ZIBBY) messages get one surface tone, user messages another —
no repeated name/glyph header.

- Find the message component: `apps/web/features/chat/components/ChatMessage.tsx` (and
  `ChatTranscript.tsx`). Locate where the "Zibby" name + `butlerSign` header is rendered
  per assistant message.
- Remove that author header (name + hat). Instead give the message bubble/container a
  role-based background tone: assistant vs user visually separated by background color
  (use DS surface tones / tokens — e.g. assistant on `surface`/accent-tinted, user on a
  different surface — pick tones consistent with the design system; keep good contrast
  in both roles). Keep any streaming/tool-event rendering intact.
- If a single leading identity is still useful (e.g. once at the top of the thread),
  that's out of scope — the ask is specifically to stop repeating it per message and lean
  on background color.

## Files
- `apps/web/features/chat/components/ChatScreen.tsx` (Part 1: switcher in top bar)
- `apps/web/features/chat/components/ChatMessage.tsx` (Part 2: drop header, tone the bg)
- possibly `ChatTranscript.tsx` (if the author header lives there)
- tests: adjust `ChatMessage`/`ChatScreen` tests that asserted the "Zibby" header /
  butlerSign per message; add a check that assistant vs user messages carry distinct
  background (testid/tone). Keep the rest green.

## Verification
- `pnpm typecheck`, scoped lint (`npx eslint apps/web/features/chat` — never bare
  `pnpm lint`), `pnpm test` green modulo known pre-existing failures (confirm via
  `git stash`).
- Manual: `/chat` shows the project switcher in its top bar (switching scopes the app);
  assistant and user messages are distinguished by background color with no repeated
  "Zibby"/hat header.

## Constraints
- No forwardRef, no `any`, no inline DOM `style`; DS primitives/tokens; i18n for any new
  label. Note the operator has unrelated uncommitted WIP (machine.*, SummaryWidget,
  design/*) — do not touch it.
