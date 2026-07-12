# Phase 120 — Per-message "read aloud" in the Chat UI

## Motivation

`POST /api/speech/synthesize` (the `speakd` TTS proxy, contracts PR #54) has been live
since `57866ca8` with no consumer anywhere in `apps/web`. This phase adds the smallest
useful one: a manual "read aloud" button on a completed assistant chat bubble. Click →
synthesize that message's text → play it back. Click again while it's speaking → stop.

This is **not** the full Voice-mode arc (`phase-119-voice-mode-chat.md`, not yet started):
no mic, no auto-speak, no sentence streaming, no voice picker. It is a small, independent
slice that happens to share the same backend endpoint 119c will also call — nothing here
blocks or is blocked by 119.

## Decisions

1. **Manual trigger only, no autoplay.** Browsers require a user gesture to play audio
   reliably; a reply appearing in the transcript never auto-plays.
2. **One button per completed assistant message**, not shown on the live-streaming bubble
   (`streaming` true) or on user turns.
3. **Default voice only.** The mutation body is `{ text }` — no `voice`/`speed`/`language`
   override, matching `SpeechSynthesizeInputSchema` (`voice` optional, `language` defaults
   `"cs"`). No settings, no picker.
4. **Module-level single player.** Only one message may speak at a time — starting a new
   one stops whatever is currently playing. Lives in
   `apps/web/features/chat/hooks/useAudioPlayback.ts` (not `apps/web/utils/`, see note
   below), a per-domain hook mirroring `useChatStream.ts`.
5. **Errors are NOT bespoke-handled.** A non-2xx `synthesize` response (400/409/422/503)
   throws (ts-rest's default for any status outside 2xx — see `create-hooks.esm.mjs`),
   which the app-wide `QueryClient` `MutationCache.onError` already turns into a toast
   (`toastBus.emit()` with the localized `common.mutationError` fallback) — the same path
   every other mutation in the app uses. No new error UI. A **playback** failure after a
   successful synthesize (a rejected `play()`, or the element's `error` event on e.g. a
   corrupt WAV) emits on the same `toastBus` from the player itself — never silent —
   while still tearing down and revoking the object URL exactly once.

### Deviation from the task brief: hook location

The brief suggested `apps/web/utils/` for the playback utility. `apps/web/utils/**/*.test.ts`
runs under vitest's **node** environment (`vitest.config.ts`), but the player needs
`Audio`/`URL.createObjectURL`, which don't exist in plain Node — they need jsdom. The repo
already has a jsdom-tested per-domain hook convention (`features/*/hooks/**/*.test.{ts,tsx}`,
see `useChatStream.ts`), so the player hook lives at
`apps/web/features/chat/hooks/useAudioPlayback.ts` instead, tested under that project.

## Implementation

- **`apps/web/features/chat/mutations/useSynthesizeSpeechMutation.ts`** — thin wrapper
  around `apiClient.speech.synthesize.useMutation()`, modeled on
  `useSendChatMessageMutation.ts`. Re-exported from `mutations/index.ts`.
- **`apps/web/features/chat/hooks/useAudioPlayback.ts`** — module-level singleton
  (`playAudioPlayback(key, audioBase64)` / `stopAudioPlayback()` / `getPlayingKey()`) plus
  a `useAudioPlayback(key)` hook (`useSyncExternalStore`) so every mounted button agrees on
  which message (if any) is currently playing. Decodes base64 → `Blob` (`audio/wav`) →
  object URL → `new Audio(url).play()`; revokes the object URL on `ended`/`error`, and on
  being superseded by a newer `play()`/`stop()`.
- **`ChatMessage.tsx`** — a small ghost icon button (`icon="play"` idle / `icon="stop"`
  while this message is playing, `loading` while its own synthesize call is in flight),
  rendered only for `role === "assistant" && !streaming && text.trim().length > 0`, next to
  the tool-events row. `useId()` gives each mounted button a stable player key. Click:
  playing → `stop()`; else → `synthesize.mutate({ body: { text } }, { onSuccess: (r) =>
  play(r.body.audioBase64) })`.
- **i18n** (`cs`/`en`, `chat.*`): `readAloud` / `readAloudStop` labels+aria.

## Tests

- `useAudioPlayback.test.ts` (jsdom): decode round-trip, single-player invariant (starting
  a second play stops the first + revokes its URL), `stop()` no-ops when nothing is
  playing, `ended`/`error` clear state, a stale callback from a superseded instance is
  ignored.
- `ChatMessage.test.tsx`: button renders only on a completed assistant message with text;
  absent on user turns and the streaming bubble; click synthesizes with the message text
  and starts playback on success; click while playing stops it (mutation + playback hook
  mocked at the module boundary, per `SubsystemDrawer.test.tsx`'s pattern).

## Verify

```
rtk pnpm check:lint
rtk pnpm check:types
rtk pnpm test
```
No backend/contract changes — `speakd` may be down throughout; nothing here requires a
live daemon.
