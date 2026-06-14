# Phase 18 — Voice command bridge (speech → action)

> Delivers ROADMAP **§7.2** (speech → action bridge) minus the TTS read-back,
> which depends on §7.1 `useSpeech` (still pending). Phase 17 made the microphone
> real (live STT → transcript → composer). This phase makes the operator's voice
> **act**: spoken commands run against the real mutations, and any other speech is
> staged as a one-tap new task. A spoken word is never a silent no-op.

## Why this is the phase (gap analysis, 2026-06-14)

LOOP.md priority axis #1 = missing user-facing functionality, mock → real. The
only North-Star capability still partial is **voice** (the one 🚧 row in the
roadmap's "Where we are today"). STT landed in 17; the next functional slice is
the command grammar — without it the voice screen is a dictation box, not a
butler you can command. TTS (the other §7.1 half) is a parallel slice; the
command bridge is chosen first because it turns voice into *control* and is fully
deterministic/testable with no new browser API surface.

## Scope (one iteration)

`parseUtterance` grammar + `runVoiceAction` executor + `useUtteranceDispatch`
wiring + `VoiceScreen` dispatching finalized utterances. **No TTS** — the ack is
rendered text (`aria-live`), not spoken; speaking it aloud is the next phase.

## Deliverables

1. **`features/voice/parseUtterance.ts`** — pure. Normalize (lowercase + NFD +
   strip combining marks + punctuation → single spaces) then match the closed
   `VoiceAction` union:
   - `{ kind: "approveLatest" }` ← `schválit/schvaluji/potvrď/approve/confirm/accept`
   - `{ kind: "rejectLatest" }` ← `odmítnout/zamítnout/zruš/reject/deny/decline`
   - `{ kind: "stopActive" }` ← `zastav(it)/stop/halt`
   - `{ kind: "closeOverlay" }` ← `zavři(t)/zavřete/konec/close/exit/dismiss/hud`
   - `{ kind: "navigate", route }` ← nav verb (`jdi na`/`přejdi na`/`otevři`/
     `zobraz`/`navigate to`/`go to`/`open`/`show me`) + a known page alias
   - `{ kind: "createTask", text }` ← fallback, **raw** utterance (diacritics kept)
   - Guard: approve/reject/stop/close only on concise utterances (≤3 words starting
     with a command verb); navigate needs an explicit verb **and** a known alias —
     else `createTask`. Unknown → `createTask`.
2. **`features/voice/runVoiceAction.ts`** — pure `(action, deps) → VoiceAck`.
   `deps = { pendingApprovalId?, activeRunId?, approve, reject, stop, navigate,
   stageTask, close }`. Returns `{ key, values? }` for i18n (`approved`,
   `nothingToApprove`, `rejected`, `nothingToReject`, `stopped`, `nothingToStop`,
   `navigating`, `closing`, `heard`). No React.
3. **`features/voice/hooks/useUtteranceDispatch.ts`** — binds the executor to the
   real `useApproveMutation` / `useRejectMutation` / `useStopAgentMutation`, the
   Next router (`useRouter().push`), and the overlay exit. "Latest" approval =
   `approvals[0]`; "active" run = first running **agent** run (stop is agent-only).
   Holds the last ack in state.
4. **`VoiceScreen.tsx`** — dispatch a new finalized live transcript exactly once
   (a `ref` debounces re-renders), render the ack in an `aria-live="polite"`
   region. Demo path + hand-to-task button unchanged.
5. **i18n** (`cs` + `en`): `voice.ack.*` keys.

## Tests (added this phase)

- `parseUtterance.test.ts`: every grammar row cs + en; diacritics present and
  stripped (`Schválit`/`schvalit`); the concise guard (a long "approve the budget
  increase for…" sentence → `createTask`, not `approveLatest`); navigate to a
  known page (`otevři runs` → `/runs`) and an unknown one (→ task); empty → task.
- `runVoiceAction.test.ts`: each action calls the right spy; approve/reject/stop
  with a target → action + success ack, without a target → the "nothing" ack;
  navigate calls `navigate` + `close`; createTask calls `stageTask`.
- `VoiceScreen.test.tsx`: a finalized command transcript calls `dispatch(text)`;
  the ack renders; the existing transcript / hand-off / interim / unsupported
  assertions stay green (the dispatch hook is mocked).

## Definition of done

`pnpm lint` → `npx tsc -p apps/web/tsconfig.json --noEmit` → web-components
vitest green (incl. the new suites) → full `pnpm test` green → `graphify update .`.
Checkpoint commit (no push — the PR is the gate).

## Out of scope (→ next phases)

- **TTS** (`useSpeech`, §7.1): speak the ack + run outcomes/approvals aloud;
  utterance-held-in-ref bug hardening, gesture-gated queue, `voiceschanged`.
- Reconnect exponential-backoff ladder, Chrome `processLocally` + phrase biasing,
  Settings → Voice (mode/language/voice picker), wake word.
