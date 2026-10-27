---
title: Chat page with several conversations side by side
type: feature
status: idea
created: 2026-10-26
---

# Chat page — multi-pane

## Goal

A dedicated chat page where the operator can keep **several conversations open next to each other** (e.g. one per engagement or topic) and work in them in parallel, instead of the single shell-global chat dock.

## Starting point

- Today the chat is the shell-global dock (`ChatDock`), always maximized when open, one conversation at a time (`ChatProvider` owns one `conversationId` + transcript, `useChatDock` owns the single SSE stream).
- Transcripts are already per-conversation files (`<CHAT_DIR>/<id>.jsonl` + `.meta.json` with the `claude --resume` session id), so the storage side already supports many threads.

## Open questions

- State: lift `ChatProvider` from one conversation to a list of open panes (each with its own transcript, scope, composer draft); keep one SSE connection and route events by `conversationId` (the stream already carries it).
- Concurrency: several in-flight `claude` turns at once — limits/budget interplay.
- Layout: fixed 2–3 columns vs. resizable split; how the dock relates to the page (hide the dock on that route?).
- Persistence: remember which panes were open (per-viewer convenience, localStorage is enough).

Related: [[session-hub]]
