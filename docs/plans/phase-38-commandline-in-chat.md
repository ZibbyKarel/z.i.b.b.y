# Phase 38 — Use the CommandLine component in the chat UI (line 33, part 31c)

> TODO (line 33): _"…Tuto komponentu pak použijeme v NewTaskDialog, na Overview a v
> rámci chat UI."_ 31a (restyle) done; NewTaskDialog uses it. This is the CHAT use.

## Goal

The chat composer becomes the unified `CommandLine` component (in a send-message mode),
so the chat input shares the same look + affordances (growable input, inline `@`-mention
of agents/pipelines with per-type coloring, file attach) as the task launcher — WITHOUT
breaking chat streaming/behavior.

## Current state (implementer confirms)

- Chat composer: `apps/web/features/chat/components/ChatComposer.tsx` — a `TextAreaField`
  + `@`-mention `SearchMenu` (agents+pipelines → `TaskTarget`) + a target `Chip` + a send
  `Button`. Props it's driven by (from `ChatScreen.tsx`): `onSend(text, target)`,
  `injectedTarget` (a target pushed from the palette, applied then consumed via
  `onInjectedTargetConsumed`), `onDraftChange(hasDraft)`, `disabled` (while `thinking`).
  Enter submits, Shift+Enter newline.
- Task launcher: `apps/web/features/tasks/components/CommandLine/CommandLine.tsx` (Phase
  31a) — growable `HighlightTextAreaField`, `@`-mention picker (same `TaskTarget` shape),
  per-type mention coloring, file attach, DropDownButton run (now/in-1h/limit-reset) →
  `useTaskSubmit`, optional panel chrome / suggestions / ack. Props include `chrome?`,
  `onTextChange?`, `onTargetChange?`, etc.

## Approach — add a send-delegation mode to CommandLine, use it in chat

1. **CommandLine `onSubmit` mode**: add an optional `onSubmit?(text, target, attachments)`
   prop. When provided, CommandLine calls it on submit INSTEAD of launching a task via
   `useTaskSubmit` (the run DropDownButton's schedule menu is irrelevant for chat — in this
   mode render a plain **Send** action, not the split schedule button; Enter = send,
   Shift+Enter = newline). No classification ack / suggestions unless asked. This keeps the
   default (task-launch) path exactly as-is for NewTaskDialog/Overview.
2. **Support the chat props on CommandLine**: `injectedTarget` + `onInjectedTargetConsumed`
   (apply an externally-picked target into the input's target chip — CommandLine already
   tracks a target; wire the injection), `onDraftChange` (emit when the input has content),
   and `disabled` (block send while the assistant is thinking). Reuse
   `onTextChange`/`onTargetChange` if they already cover these.
3. **Swap in ChatScreen**: replace `<ChatComposer .../>` (in `ChatScreen.tsx`'s composer
   region, ~lines 483-494) with `<CommandLine onSubmit={send} injectedTarget={...}
   onInjectedTargetConsumed={...} onDraftChange={setHasDraft} disabled={thinking}
   chrome={false} />` (chrome off — the chat composer sits in its own bottom bar; no double
   frame). Preserve the `max-w-[720px]` container. Keep the assistant streaming path
   (`send` → mutation + SSE) 100% intact.
4. **ChatComposer**: if fully replaced and unreferenced, delete it + its test (knip-clean).
   If chat needs a thin adapter, keep a minimal one — but prefer using CommandLine directly.
5. **Attachments in chat**: chat messages may not support attachments today — if `send`
   has no attachment channel, either hide the attach button in chat mode (a `showAttach?`
   prop, default true) or wire attachments through if the chat message API supports it.
   Don't fabricate an attachment path that the backend ignores; hide it if unsupported.

## Files
- `apps/web/features/tasks/components/CommandLine/CommandLine.tsx` (+ its test) — add
  `onSubmit` send-mode, `injectedTarget`/`onInjectedTargetConsumed`/`disabled`, optional
  `showAttach`, plain Send button in send-mode.
- `apps/web/features/chat/components/ChatScreen.tsx` — use CommandLine in the composer slot.
- `apps/web/features/chat/components/ChatComposer.tsx` (+ test) — delete if unreferenced.
- tests: chat send-flow via CommandLine (Enter sends, target injection, disabled while
  thinking); keep task-launch CommandLine tests green (default path unchanged).

## Verification
- `pnpm typecheck`, scoped lint (`npx eslint apps/web/features/chat apps/web/features/tasks`
  — never bare `pnpm lint`), `pnpm test` green modulo known pre-existing failures (confirm
  via `git stash`; 2 machine.service.ts errors are operator WIP).
- Manual: `/chat` — type a message, `@`-mention an agent/pipeline (inline, colored), send
  with Enter; streaming still works; the palette-injected target still lands in the input;
  input disabled while ZIBBY is thinking. NewTaskDialog + task launch unaffected.

## Constraints
- No forwardRef, no `any`, export props, no inline DOM `style`. Preserve ALL chat streaming
  behavior — this is a composer swap, not a chat-logic change. Don't touch operator WIP
  (machine.*, SummaryWidget, design/*).
