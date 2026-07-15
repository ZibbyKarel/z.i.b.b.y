/* eslint-disable react/forbid-dom-props -- A bespoke JARVIS-style HUD surface:
   scanline/grid overlays, the ambient orb behind the conversation and the
   transcript's top fade-mask are decorative inline styles with no DS prop
   equivalent — sanctioned escape hatch, file-level. */
"use client";

import type { ChatMessage as ChatMessageType, SubsystemId, TaskTarget } from "@zibby/contracts";
import { Button, Container, Stack, Typography } from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNow } from "../../../hooks/useNow";
import { MINUTE_MS } from "../../../utils/time";
import { usePipelinesQuery } from "../../pipelines";
import { useRunAvatarMap, useRunGlyphMap, useRunsQuery } from "../../runs/queries/useRunsQuery";
import { runAvatar, runGlyph } from "../../runs/run";
import { useRunActions } from "../../runs/useRunActions";
import { SubsystemDrawer } from "../../subsystems/components/SubsystemDrawer/SubsystemDrawer";
import { useSubsystemsQuery } from "../../subsystems/queries/useSubsystemsQuery";
import { useSystemConfigQuery } from "../../system";
import { CommandLine } from "../../tasks/components/CommandLine/CommandLine";
import { useAnyAudioPlaying } from "../hooks/useAudioPlayback";
import { type AutoSpeakReplyOutcome, useAutoSpeak } from "../hooks/useAutoSpeak";
import { type CompletedTurn, useChatStream } from "../hooks/useChatStream";
import { useVoiceMode } from "../hooks/useVoiceMode";
import { useSendChatMessageMutation } from "../mutations/useSendChatMessageMutation";
import { ChatDetailDialog, type ChatDetailTarget } from "./ChatDetailDialog";
import { ChatPalette } from "./ChatPalette";
import { ChatTaskDetailColumn } from "./ChatTaskDetailColumn";
import { ChatTasksPanel } from "./ChatTasksPanel";
import { ChatToolDock } from "./ChatToolDock";
import { ChatTopBar } from "./ChatTopBar";
import { ChatTranscript } from "./ChatTranscript";
import { CoreOverviewDialog } from "./CoreOverviewDialog";
import { SubsystemOrbMap } from "./SubsystemOrbMap";
import { VoiceStatusStrip } from "./VoiceStatusStrip";
import { VoiceToggleButton } from "./VoiceToggleButton";

export enum ChatScreenTestId {
  Root = "chat-screen",
  ScrollArea = "chat-screen-scroll",
  Greeting = "chat-screen-greeting",
  NewChat = "chat-screen-new-chat",
}

/** The chat top-bar band height — the orb ellipse is inset by this so its top
 *  ring clears the bar instead of sitting under it (the bar is a z-20 overlay
 *  over the full-screen map). */
const CHAT_TOPBAR_INSET = 56;

export interface ChatScreenProps {
  /**
   * The conversation this thread owns. Minted once by {@link ChatProvider} and
   * preserved across leaving `/chat` and coming back; only "New chat" mints a
   * fresh one.
   */
  conversationId: string | null;
  /**
   * The transcript, owned by {@link ChatProvider} so it survives navigating away
   * from `/chat` and back.
   */
  messages: ChatMessageType[];
  /** Append/replace transcript turns (lifted setter from the provider). */
  onMessagesChange: Dispatch<SetStateAction<ChatMessageType[]>>;
  /** Start a fresh thread: clears the transcript and mints a new conversation. */
  onNewChat: () => void;
}

/**
 * The chat-first conversational surface, rendered by the `/chat` route inside the
 * dashboard shell (nav rail + top bar around it) — a JARVIS-style HUD with an
 * ambient {@link SubsystemOrbMap} behind the conversation, a scrollable transcript that
 * fades into nothing at the top (scroll up to read back to the start), and the
 * text composer pinned at the bottom.
 *
 * The conversation lives in {@link ChatProvider}'s client state (passed in via
 * `messages` / `onMessagesChange`) so it survives this component unmounting when
 * the operator navigates away from `/chat`: the operator's turn is appended
 * optimistically on send, and the assistant's turn is appended from the stream's
 * `done` (authoritative text + accumulated tool events). The backend still writes
 * every message to the JSONL transcript — the UI just renders what the stream
 * produced rather than refetching, which is what removed the "history disappears
 * after a reply" flash. Coming back to `/chat` shows the same thread; "New chat" is
 * the only reset.
 */
export function ChatScreen({
  conversationId,
  messages,
  onMessagesChange,
  onNewChat,
}: ChatScreenProps) {
  const t = useTranslations("chat");
  const now = useNow(MINUTE_MS);
  const router = useRouter();

  // The lifted setter is a stable useState dispatcher from the provider; alias it so
  // the append helpers read like the original local-state version.
  const setMessages = onMessagesChange;
  const sendMessage = useSendChatMessageMutation();

  // The operator's `/settings` voice pick (Phase 119c) — read here (not inside
  // `useAutoSpeak`) so the hook's own tests stay free of a QueryClient dependency;
  // the hook holds it in a ref (see its doc comment) so a config change never
  // rebuilds the stable `speak`/`cancel` controller.
  const { data: systemConfig } = useSystemConfigQuery();

  // Turn-taking paused latch (Phase 119d / Decision 7): set when a voice reply is
  // interrupted (a manual read-aloud took over, an external stop, or a synth
  // fault) so the mic does NOT auto re-arm — the operator took over; voice mode
  // stays on but paused (the status strip shows the paused state). Cleared on a
  // natural completion, on a new operator turn (`send`), and on toggling voice
  // off — so toggling off/on always recovers.
  const [voicePaused, setVoicePaused] = useState(false);
  const handleReplySettled = useCallback((outcome: AutoSpeakReplyOutcome) => {
    setVoicePaused(outcome === "interrupted");
  }, []);

  // Voice-reply orchestrator (Phase 119b) — chunked TTS of a finished turn, played
  // under the single `"voice-mode"` player key. `speakReply`/`cancelReply` are
  // stable identities (so composing them into the stream's `onComplete` doesn't
  // re-subscribe); `speakingReply` drives the `speaking` scene mode; `onSettled`
  // reports the terminal outcome that drives the turn-taking latch above.
  const {
    speak: speakReply,
    cancel: cancelReply,
    speaking: speakingReply,
  } = useAutoSpeak({
    voice: systemConfig?.ttsVoice,
    onSettled: handleReplySettled,
  });
  // The latest voice-mode on/off, read inside the (stable) completion handler
  // without re-creating it. Assigned just below, once `voice` exists.
  const voiceActiveRef = useRef(false);

  const appendAssistant = useCallback(
    ({ turnId, text, toolEvents }: CompletedTurn) => {
      if (!text && toolEvents.length === 0) return;
      setMessages((prev) => [
        ...prev,
        {
          id: turnId,
          role: "assistant",
          text,
          at: new Date().toISOString(),
          ...(toolEvents.length > 0 ? { toolEvents } : {}),
        },
      ]);
    },
    [setMessages],
  );

  const appendError = useCallback(
    (message: string) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${crypto.randomUUID()}`,
          role: "assistant",
          text: message,
          at: new Date().toISOString(),
        },
      ]);
    },
    [setMessages],
  );

  // In voice mode, a finished turn is spoken (Phase 119b) — after the transcript
  // commit, never before. Stable (deps are all stable), so the stream doesn't
  // re-subscribe as voice mode toggles; the live `voice.active` is read via the ref.
  const handleComplete = useCallback(
    (turn: CompletedTurn) => {
      appendAssistant(turn);
      if (voiceActiveRef.current && turn.text) speakReply(turn.text);
    },
    [appendAssistant, speakReply],
  );

  const stream = useChatStream(conversationId, {
    onComplete: handleComplete,
    onError: appendError,
  });

  // A turn is in flight from send (`isPending`) through the streamed reply until
  // the terminal `done`/`error` (Phase 14.1). Hoisted above `send`/`voice` (was
  // derived lower down pre-119d) because turn-taking now needs it as the mic's
  // idle gate.
  const thinking = sendMessage.isPending || stream.streaming;

  const send = (text: string, target?: TaskTarget) => {
    if (!conversationId) return;
    // Barge-in (Decision 6): a new operator message — typed or a spoken final —
    // stops any voice reply mid-playback.
    cancelReply();
    // A new operator turn clears the paused latch: whatever the operator did to
    // pause the loop (a manual read-aloud), sending resumes the hands-free cycle
    // once this turn's reply settles.
    setVoicePaused(false);
    setMessages((prev) => [
      ...prev,
      { id: `u-${crypto.randomUUID()}`, role: "user", text, at: new Date().toISOString() },
    ]);
    // The composer owns `target` (the @mention picker, Phase 14.2) and clears its own
    // selection once this fires — nothing further to reset here.
    sendMessage.mutate({ body: { conversationId, text, ...(target ? { target } : {}) } });
  };

  // Whether ANY audio is playing — voice queue OR a manual phase-120 read-aloud.
  // Guards the echo hazard below.
  const anyAudioPlaying = useAnyAudioPlaying();

  // Turn-taking gate (Phase 119d / Decision 7): the mic is armed only when idle —
  // disarmed while a turn is in flight (`thinking`), while the reply is speaking
  // (`speakingReply` — kept even though `anyAudioPlaying` overlaps it: it also
  // covers the synth gaps between chunks when nothing is playing yet), while
  // paused after a manual read-aloud took over mid-reply (`voicePaused`), and
  // while ANY audio plays (`anyAudioPlaying`) — the ECHO HAZARD: a manual
  // read-aloud clicked while the mic is idle-armed would otherwise be transcribed
  // off the speakers and auto-SENT as a chat message (a self-talk loop). That
  // manual playback suspends the mic only transiently: when it ends, the store
  // notifies, this clears, and the mic re-arms — no latch involved, since no
  // voice-reply session was interrupted. A single boolean the mic effect reacts
  // to; it re-arms on the settle/state transition, never a timer, so the mic
  // can't catch the tail of the TTS audio.
  const voiceSuspended = thinking || speakingReply || voicePaused || anyAudioPlaying;

  // Voice mode (Phase 119a) — hands-free STT over the Web Speech API. A finalized
  // utterance is a chat message: it calls `send` directly, bypassing the composer
  // (Decision 1). ChatScreen-local, ephemeral state (Decision 2) — leaving `/chat`
  // unmounts this and stops the mic. The toggle is rendered only when `supported`.
  const voice = useVoiceMode({ onSend: send, suspended: voiceSuspended });

  // Mirror the live voice-mode flag into the ref the (stable) completion handler
  // reads, and barge-in (Decision 6): toggling voice mode off stops any in-flight
  // reply. Written in an effect, never during render (`react-hooks/refs`).
  // Unmounting is handled inside `useAutoSpeak`'s own cleanup.
  useEffect(() => {
    voiceActiveRef.current = voice.active;
    if (!voice.active) cancelReply();
  }, [voice.active, cancelReply]);

  // The paused latch is cleared on every toggle (off→on and on→off), so toggling
  // voice mode off/on always recovers a paused loop to an armed mic — done here in
  // the click handler rather than the effect above (`set-state-in-effect`), and it
  // reads cleaner beside the toggle anyway.
  const handleVoiceToggle = useCallback(() => {
    setVoicePaused(false);
    voice.toggle();
  }, [voice.toggle]);

  // Keep the latest turn in view as messages land and tokens stream in.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, stream.text, stream.toolEvents.length]);

  // Phase 14.5: the ⌘K quick-switcher is an overlay ON TOP of the conversation.
  // Owned here (not by the palette itself) so Esc priority and the search-bar
  // toggle read from one source of truth. (Phase 39 removed the sibling activity
  // panel this used to be mutually exclusive with — the HUD right rail is the
  // single ambient activity log now.)
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => {
    setPaletteOpen((v) => !v);
  }, []);

  // A result picked in the palette (agents/pipelines) opens its read-only DETAIL
  // here in a dialog (Phase 58) instead of being injected into the composer — the
  // inline `@`-search on `CommandLine` owns adding a target to the input now, so
  // ⌘K stops duplicating it. `undefined` = no dialog open.
  const [detailTarget, setDetailTarget] = useState<ChatDetailTarget | undefined>(undefined);
  const handleDetailSelect = useCallback((detail: ChatDetailTarget) => {
    setDetailTarget(detail);
  }, []);
  const handlePaletteNavigate = useCallback(
    (href: Route) => {
      // Gates/memory have nowhere to render inline yet (Decision 7's sanctioned
      // fallback) — navigating there leaves `/chat`, same as any other nav-rail jump.
      setPaletteOpen(false);
      router.push(href);
    },
    [router],
  );

  // Esc priority: the palette sits on top of the conversation itself — a single Esc
  // dismisses it. As a routed page there is nothing left for Esc to close once it's
  // shut (the nav rail / browser back is how the operator leaves `/chat`).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (paletteOpen) {
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [paletteOpen]);

  // ⌘K / Ctrl+K opens the quick-switcher — the same toggle the SearchBar's click
  // goes through, so a second press closes it rather than stacking overlays.
  // Phase 23 dropped this listener because the chat surface used to sit over the
  // HUD's own global ⌘K search (double-open); now that `/chat` is fullscreen and
  // bypasses `MainLayout` (phase 27), there is no competing handler on this route,
  // so re-adding it is safe — no capture-phase suppression needed.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      openPalette();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openPalette]);

  const isEmpty = messages.length === 0 && !stream.streaming;

  // The pipeline catalog — still needed to feed `SubsystemOrbMap`'s active-run
  // counts (it maps a run's `owner` pipeline to its `ownerSubsystem`).
  const { data: pipelineCatalog } = usePipelinesQuery();

  // The running/queued runs feed (kept fresh by the shared RunEventsProvider bus).
  const { runs } = useRunsQuery();

  // The subsystem web (Phase 83): the 8 named subsystems + live status, polled by
  // `useSubsystemsQuery` (Phase 80/82). Selection is local — clicking a node reports
  // its id via `onSelectSubsystem`, and the drawer below reads `selectedSubsystemId`
  // to render the subsystem's detail alongside the transcript. There's no selection
  // ring on the node itself (Task 13) — the drawer opening IS the selection feedback.
  const { data: subsystems } = useSubsystemsQuery();
  const [selectedSubsystemId, setSelectedSubsystemId] = useState<SubsystemId | null>(null);
  // Task C1: clicking the central orb opens the whole-federation overview dialog
  // (Task A1's `CoreOverviewDialog`) instead of the per-subsystem drawer below.
  // Picking a subsystem row inside it reuses the EXISTING `setSelectedSubsystemId`
  // (Decision D4) — it closes the overview and opens the same drawer a direct
  // mini-orb click would.
  const [coreOpen, setCoreOpen] = useState(false);
  // Resolved against the live status list so the drawer always shows fresh
  // state/counts (Phase 84) — a dangling id (the polled list momentarily
  // dropping an entry) just renders nothing rather than stale data.
  const selectedSubsystem = subsystems?.find((s) => s.id === selectedSubsystemId) ?? null;

  // Phase 100: the left tasks panel's selection — a click opens the run's detail
  // inline, in a column beside the panel, rather than the old `/runs?run=<id>`
  // redirect. Re-clicking the already-selected row toggles it off (mirrors the
  // Phase 92 accordion this replaces). Resolved against the same `runs` feed the
  // dock reads above — no second fetch.
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const selectRun = useCallback((runId: string) => {
    setSelectedRunId((cur) => (cur === runId ? null : runId));
  }, []);
  const selectedRun = runs.find((r) => r.runId === selectedRunId) ?? null;
  const runGlyphById = useRunGlyphMap();
  const runAvatarById = useRunAvatarMap();
  // Same Stop/Resume/Delete wiring `runs/Screen.tsx` uses (factored into
  // `useRunActions`, Phase 100) — resuming jumps the selection to the fresh run;
  // deleting clears it so the column never briefly points at a now-gone run.
  const runActions = useRunActions(
    (runId) => setSelectedRunId(runId),
    () => setSelectedRunId(null),
  );

  return (
    <div
      aria-label={t("title")}
      className="relative flex h-full w-full flex-col overflow-hidden font-sans"
      data-testid={ChatScreenTestId.Root}
    >
      {/* Task B6: the immersive orb map's clean radial backdrop, centered at
          50% 42% (the app-shell's shared --gradient-scene token is top-anchored
          at -8% for other pages — this page needs its own center to frame the
          orb map). Sits behind `SubsystemOrbMap`; shows through at any edge its
          DOM layers don't cover. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[image:radial-gradient(ellipse_130%_100%_at_50%_42%,#121a27_0%,var(--color-background)_62%)]"
      />
      {/* Scanlines + grid overlays */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg,rgba(255,255,255,0.011) 0px,rgba(255,255,255,0.011) 1px,transparent 1px,transparent 5px)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-border) 1px,transparent 1px),linear-gradient(90deg,var(--color-border) 1px,transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%,#000 10%,transparent 80%)",
        }}
      />

      {/* ── Top bar (Task 6) ────────────────────────────────────────────
          The Velín-D glass chrome: `ChatTopBar` owns its own five elements —
          status pill, search trigger, limits gauge, HUD switch and language
          switch — no bespoke markup left here. Voice and New-chat moved down
          to the composer (below); Close was removed entirely (the right tool
          dock is the navigation now). */}
      <div className="relative z-20 shrink-0 px-[22px]">
        <ChatTopBar onOpenPalette={openPalette} />
      </div>

      {/* ── Right tool dock (Task 6) ─────────────────────────────────────
          A glass island pinned to the right edge, vertically centered,
          floating above the orb map (`zIndex` above its layers) — the same
          treatment the left tasks panel gets. `pointer-events-auto` re-enables
          clicks through the page's ambient pointer-events-none scene. */}
      <Container
        pointerEvents="auto"
        position="absolute"
        right="24px"
        style={{ transform: "translateY(-50%)" }}
        top="50%"
        zIndex={20}
      >
        <ChatToolDock />
      </Container>

      {/* The immersive orb map (Task 13), filling the page — the ellipse of
          subsystem orbs ringing the central conversational core. Sits behind every
          interactive surface (its DOM layers are pointer-events:none apart from
          the orbs themselves); the transcript floats over it in a legibility-
          protected band. Static phase-1 insets matching the left tasks panel
          (300px, `w-[300px]` below) and the composer band (`~230px`, the
          border-t + max-w-[720px] py-4 bar further down) — a measured-ref
          refinement is optional follow-up polish, not required for parity. The
          right inset now reserves the tool dock's width (Task 6) instead of 0. */}
      <SubsystemOrbMap
        insets={{ top: CHAT_TOPBAR_INSET, left: 0, right: 0, bottom: 400 }}
        onOpenCore={() => setCoreOpen(true)}
        onSelectSubsystem={setSelectedSubsystemId}
        pipelines={pipelineCatalog ?? []}
        runs={runs}
        subsystems={subsystems ?? []}
        thinking={stream.streaming || sendMessage.isPending}
      />

      {/* ── Main area: scene behind, scrollable conversation over it ─────
          Phase 99: this outer wrapper deliberately carries NO explicit
          z-index — only `relative` (a containing block for the drawer below,
          but not a stacking context of its own). An explicit z here would
          re-create the exact trap this phase fixes: the inner wrapper right
          below (kept at `z-10`, unchanged) IS a stacking context, so anything
          nested inside it is confined below root-level siblings regardless of
          its own z-index — which is what used to bury the subsystem drawer's
          close button under `SubsystemOrbsOverlay` and its Add-rule button
          under the composer (both root-level `z-20`). Rendering the drawer as
          a child of THIS wrapper instead — still `relative`, so the drawer's
          `inset-y-0` resolves against the same band, between the top bar and
          the composer — lets its `z-30` (`SubsystemDrawer.tsx`) compete
          directly against those siblings and win. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Task 15 fix: this wrapper is `h-full w-full` and paints over the whole
            SubsystemOrbMap behind it. Without `pointer-events-none` here it swallowed
            every click outside its own populated regions — orbs and the core became
            unclickable everywhere except inside the transcript box and the left panel.
            `pointer-events-none` on the wrapper + `pointer-events-auto` back on the
            transcript scroll area below (the left panel already does this) restores
            the passthrough the OrbMap doc comment above assumes. */}
        <div className="pointer-events-none relative z-10 flex h-full w-full flex-col items-center justify-end">
          {/* ── Left panel: ALL tasks in scope (Phase 57, was running-only in 44) ─
              A `z`-raised fixed-width column pinned to the left, above the scene
              like the top bar / composer. `pointer-events-none` on the gutter so
              the scene stays interactive around it (the panel itself re-enables
              them); hidden below `lg` so it never crowds the centered transcript
              on a narrow viewport. */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-20 hidden w-[300px] flex-col p-4 lg:flex">
            <div className="pointer-events-auto">
              <ChatTasksPanel onSelectRun={selectRun} selectedRunId={selectedRunId} />
            </div>
          </div>

          <div
            className="pointer-events-auto relative z-10 flex h-1/2 w-full max-w-[720px] flex-col overflow-y-auto px-5 py-8"
            data-testid={ChatScreenTestId.ScrollArea}
            ref={scrollRef}
            style={{
              // Phase 95: set to half-height so the transcript lives entirely in the
              // BOTTOM HALF, below the compact top-third subsystem cluster (phase 94's
              // two-thirds box let a tall thread's dissolving top ghost over the lower
              // mini-orbs). Still a box pinned to the bottom (right above the composer):
              // the conversation grows UP from the input — newest turn always at the
              // bottom — and `mt-auto` keeps a short thread bottom-anchored. The mask
              // fades the box's top ~40% into nothing so any turn that scrolls up
              // dissolves before it can reach the cluster's band, while the lower part
              // stays fully readable. It still scrolls all the way back to the start —
              // turns near the top just stay ghosted (declarative mask, scroll intact).
              maskImage: "linear-gradient(to bottom, transparent 0%, #000 40%, #000 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 40%, #000 100%)",
            }}
          >
            {/* `mt-auto` pins short conversations to the bottom (first turn sits just
                above the composer); a tall one overflows and scrolls normally. */}
            <div className="mt-auto">
              {isEmpty ? (
                <Container data-testid={ChatScreenTestId.Greeting}>
                  <Stack align="center" gap="100">
                    <Typography align="center" tone="accent" type="subtitle" weight="medium">
                      {t("greetingTitle")}
                    </Typography>
                    <Typography align="center" type="note" variant="tertiary">
                      {t("greetingHint")}
                    </Typography>
                  </Stack>
                </Container>
              ) : (
                <ChatTranscript
                  liveText={stream.text}
                  liveToolEvents={stream.toolEvents}
                  messages={messages}
                  streaming={stream.streaming}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── Subsystem drawer (Phase 84; moved out of the inner z-10 wrapper
            above by Phase 99 — see this outer wrapper's own doc comment) ──
            An inline panel over the chat, never a page navigation — docked
            right of the transcript on lg+ (chat stays interactive to its
            left), a full-width sheet below lg (PROVISIONAL, see the drawer's
            own doc comment). Selecting a subsystem in the web above swaps
            this drawer's content rather than opening a second one. */}
        {selectedSubsystem && (
          <SubsystemDrawer
            onClose={() => setSelectedSubsystemId(null)}
            subsystem={selectedSubsystem}
          />
        )}

        {/* ── Task detail column (Phase 100) ──────────────────────────────
            A click in `ChatTasksPanel` (the 300px left gutter above) opens the
            run's detail HERE, immediately to its right, instead of redirecting
            to `/runs?run=<id>`. Mounted the same way the subsystem drawer is —
            a sibling of it, outside the inner z-10 wrapper — so its own z-index
            competes directly with the composer/top bar rather than being capped
            by that wrapper's stacking context (see the drawer's doc comment
            above); the two never overlap (opposite sides of the same band). */}
        {selectedRun && (
          <ChatTaskDetailColumn
            avatar={runAvatar(selectedRun, runAvatarById)}
            deleting={runActions.deleting}
            glyph={runGlyph(selectedRun, runGlyphById)}
            now={now}
            onClose={() => setSelectedRunId(null)}
            onDelete={() => runActions.remove(selectedRun.runId, selectedRun.kind)}
            onResume={() => runActions.resume(selectedRun)}
            onStop={() => runActions.stop(selectedRun)}
            resuming={runActions.resuming}
            run={selectedRun}
            stopping={runActions.stopping}
          />
        )}
      </div>

      {/* ── Subsystem mini-orbs ──────────────────────────────────────────
          Task 13: the 8 subsystems render as `SubsystemOrbMap` DOM/CSS orb
          nodes above (ringed around the central core), each an interactive,
          keyboard-reachable `OrbNode` with its own hit-target, label, and
          status badge — no WebGL, no per-frame projection math. Selection
          still opens the drawer below. */}

      {/* ── Composer ─────────────────────────────────────────────────
          Phase 38: the unified `CommandLine` launcher in send-delegation mode
          (`onSubmit`) — same growable input + @mention picker as the task
          launcher, `chrome={false}` (this bar is its own frame already), and
          `showAttach={false}` since the chat message API has no attachment
          channel yet (Phase 38 plan §5). Task 6: the voice toggle and New-chat
          (now a trash icon) moved down here from the old top bar — a minimal
          touch on this dock, not the full redesign (next phase). */}
      <div className="relative z-20 shrink-0 border-t border-border px-5 py-4">
        <div className="mx-auto max-w-[720px]">
          <Stack align="stretch" direction="col" gap="100">
            {(voice.supported || messages.length > 0) && (
              <Stack align="center" direction="row" gap="150" justify="between">
                {/* Voice toggle + status strip (Phase 119a) — the listening
                    indicator + live interim transcript sits beside the toggle,
                    ABOVE the composer, never inside it (Decision 1). The strip
                    itself is mounted only while voice mode is on. */}
                <Stack align="center" direction="row" gap="100">
                  {voice.supported && (
                    <VoiceToggleButton active={voice.active} onToggle={handleVoiceToggle} />
                  )}
                  {voice.active && (
                    <VoiceStatusStrip interim={voice.interim} listening={voice.listening} />
                  )}
                </Stack>
                {messages.length > 0 && (
                  <Button
                    aria-label={t("newChat")}
                    data-testid={ChatScreenTestId.NewChat}
                    icon="trash"
                    intent="ghost"
                    onClick={onNewChat}
                    size="sm"
                    title={t("newChat")}
                  />
                )}
              </Stack>
            )}
            <CommandLine
              showAttach
              chrome={false}
              disabled={thinking}
              label={t("composer.label")}
              onSubmit={send}
              placeholder={t("composer.placeholder")}
            />
          </Stack>
        </div>
      </div>

      {/* ── Quick-switcher (Phase 14.5) ──────────────────────────────────
          Floats above everything else on the page; mounted only while open
          so its own data hooks don't fire until the operator asks. */}
      {paletteOpen && (
        <ChatPalette
          onClose={() => setPaletteOpen(false)}
          onDetailSelect={handleDetailSelect}
          onNavigate={handlePaletteNavigate}
        />
      )}

      {/* ── Result detail (Phase 58) ────────────────────────────────────
          A pick in the ⌘K quick-switcher opens the agent/pipeline's read-only
          detail here — a viewing dialog, never an edit surface (edits live on the
          entity's own /agents·/pipelines page). */}
      {detailTarget && (
        <ChatDetailDialog detail={detailTarget} onClose={() => setDetailTarget(undefined)} />
      )}

      {/* ── ZIBBY overview (Task C1) ─────────────────────────────────────
          Clicking the central orb (via `SubsystemOrbMap`'s core hit-target)
          opens this whole-federation snapshot. Picking a subsystem row inside
          it reuses the existing selection state, so it closes the overview and
          opens the same `SubsystemDrawer` a direct mini-orb click would
          (Decision D4). */}
      <CoreOverviewDialog
        onClose={() => setCoreOpen(false)}
        onSelectSubsystem={(id) => {
          setCoreOpen(false);
          setSelectedSubsystemId(id);
        }}
        open={coreOpen}
      />
    </div>
  );
}
