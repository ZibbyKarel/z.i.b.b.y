---
title: Session hub — cross-AI sessions grouped by topic
type: feature
status: idea
created: 2026-10-26
---

# Session hub

## Goal

Once ZIBBY runs several AIs in the background (not only Claude), the operator can see **all sessions from all providers in one place**, grouped by **topic**, read a **summary** of a topic, and **continue where they left off** — even in a different provider.

Not the goal: just listing Claude Code sessions from `~/.claude/projects`.

## Architecture

1. **Canonical conversation file.** Every provider session is imported/mirrored into one markdown/JSONL file in the vault: `provider`, `providerSessionId`, `cwd`, `startedAt`, messages, link to the original. Each provider gets a small adapter (`read`, optional `resume`); the rest of ZIBBY knows nothing about provider formats.
2. **Topic as a first-class note.** A topic is an MOC note (`topics/<slug>.md`) with wikilinks to conversations and a running summary. A session can belong to several topics. Assignment is done in the background (distiller); the operator can override it.
3. **Summary is derived.** Generated from the topic's conversations, stored in the topic note, regenerated only when a new session arrives. The last section is "where I left off": open questions and the next step.
4. **Two ways to continue.**
   - *Native resume* where the provider supports it (Claude: `--resume` in the original cwd).
   - *Handoff* for everything else, including cross-provider: the new session gets the topic summary + last N messages as context.

## Hard parts

- **Capture:** for providers outside the ZIBBY chat we need an importer (read their files or a hook), otherwise the hub only shows what went through it.
- **Topic quality:** no vectors (index-first), so grouping is LLM classification against existing topics. New topics need operator confirmation, never silent creation.
- **Privacy:** work and personal sessions in one vault need a `scope` tag so team.blue content never leaks into personal summaries.
- **Claude resume caveats:** `--resume` is cwd-bound; ZIBBY chat runs with `--setting-sources ""` and its own tool args, so a terminal session resumed there behaves differently (history loads, environment does not).
- **Noise:** agent/workflow runs live next to chats in `~/.claude/projects` (`...-agents-runs-...`) and must be filtered out.

## Suggested order

1. `Conversation` + `Topic` contracts in `libs/contracts`.
2. Claude adapter: import `~/.claude/projects` (interactive sessions only).
3. Manual topic tagging + topic page with conversation list.
4. Automatic topic assignment + summary.
5. Handoff continuation; further provider adapters.

Value is visible after step 3.

## Related

- Existing chat: `apps/api/src/chat/chat-session.service.ts` (`claude -p --resume <sid>`)
- Memory distiller: `apps/api/src/memory/memory-distiller.service.ts`
