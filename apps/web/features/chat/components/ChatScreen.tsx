/* eslint-disable react/forbid-dom-props -- A bespoke JARVIS-style HUD surface:
   scanline/grid overlays, the ambient orb behind the conversation and the
   transcript's top fade-mask are decorative inline styles with no DS prop
   equivalent — sanctioned escape hatch, file-level. */
"use client";

import type {
  ChatMessage as ChatMessageType,
  ChatToolEvent,
  SubsystemId,
  TaskTarget,
} from "@zibby/contracts";
import {
  Container,
  type DotTone,
  Icon,
  SearchBar,
  Stack,
  StatusDot,
  Typography,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNow } from "../../../hooks/useNow";
import { MINUTE_MS } from "../../../utils/time";
import { useAgentsQuery } from "../../agents/queries/useAgentsQuery";
import { useChainsQuery } from "../../chains";
import { usePinsQuery } from "../../pins";
import { usePipelineRunQuery, usePipelinesQuery } from "../../pipelines";
import { useRunAvatarMap, useRunGlyphMap, useRunsQuery } from "../../runs/queries/useRunsQuery";
import { runAvatar, runGlyph } from "../../runs/run";
import { useRunActions } from "../../runs/useRunActions";
import { SubsystemDrawer } from "../../subsystems/components/SubsystemDrawer/SubsystemDrawer";
import { useSubsystemsQuery } from "../../subsystems/queries/useSubsystemsQuery";
import { CommandLine } from "../../tasks/components/CommandLine/CommandLine";
import { useAutoSpeak } from "../hooks/useAutoSpeak";
import { type CompletedTurn, useChatStream } from "../hooks/useChatStream";
import { useVoiceMode } from "../hooks/useVoiceMode";
import { useSendChatMessageMutation } from "../mutations/useSendChatMessageMutation";
import { buildConstellation } from "../scene/constellation";
import { CosmicScene } from "../scene/CosmicScene";
import { buildDock } from "../scene/dock";
import type { SceneMode } from "../scene/sceneTypes";
import { ChatDetailDialog, type ChatDetailTarget } from "./ChatDetailDialog";
import { ChatPalette } from "./ChatPalette";
import { ChatTaskDetailColumn } from "./ChatTaskDetailColumn";
import { ChatTasksPanel } from "./ChatTasksPanel";
import { ChatTranscript } from "./ChatTranscript";
import { VoiceStatusStrip } from "./VoiceStatusStrip";
import { VoiceToggleButton } from "./VoiceToggleButton";

/**
 * The header status dot — the same canonical state vocabulary that drives the orb,
 * expressed through the shared {@link StatusDot} primitive instead of a bespoke
 * inline colour. Maps the derived {@link SceneMode} to a dot tone + whether it's live.
 */
const MODE_DOT: Record<SceneMode, { tone: DotTone; pulse: boolean }> = {
  idle: { tone: "accent", pulse: false },
  listening: { tone: "accent", pulse: true },
  thinking: { tone: "run", pulse: true },
  streaming: { tone: "run", pulse: true },
  speaking: { tone: "ok", pulse: true },
  tool: { tone: "run", pulse: true },
  "waiting-approval": { tone: "wait", pulse: true },
  error: { tone: "bad", pulse: false },
};

/** Statuses that put the orb in `waiting-approval` — a run parked on the
 * operator's decision (Rozhodnutí 5, phase-15 plan): over budget/behind an
 * approval (`awaiting-approval`/`held`) or parked after exhausting retries
 * (`parked`). */
const WAITING_APPROVAL_STATUSES = new Set(["awaiting-approval", "parked", "held"]);

/**
 * The most recent tool event carrying a `runRef`, newest first — searched across
 * a list of tool-event arrays in the order given (the caller passes the live
 * stream buffer before the committed transcript so an in-flight turn's dispatch
 * wins over an older one).
 */
function findLastRunRef(toolEventLists: (ChatToolEvent[] | undefined)[]): string | null {
  for (const events of toolEventLists) {
    if (!events) continue;
    for (let i = events.length - 1; i >= 0; i--) {
      const runRef = events[i]?.runRef;
      if (runRef) return runRef;
    }
  }
  return null;
}

export enum ChatScreenTestId {
  Root = "chat-screen",
  ScrollArea = "chat-screen-scroll",
  Greeting = "chat-screen-greeting",
  Close = "chat-screen-close",
  NewChat = "chat-screen-new-chat",
}

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
  /** Leave `/chat` and go back to the dashboard (top-bar close action). */
  onClose: () => void;
}

/**
 * The chat-first conversational surface, rendered by the `/chat` route inside the
 * dashboard shell (nav rail + top bar around it) — a JARVIS-style HUD with an
 * ambient {@link ChatOrb} behind the conversation, a scrollable transcript that
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
  onClose,
}: ChatScreenProps) {
  const t = useTranslations("chat");
  const now = useNow(MINUTE_MS);
  const router = useRouter();

  // The lifted setter is a stable useState dispatcher from the provider; alias it so
  // the append helpers read like the original local-state version.
  const setMessages = onMessagesChange;
  const sendMessage = useSendChatMessageMutation();

  // Voice-reply orchestrator (Phase 119b) — chunked TTS of a finished turn, played
  // under the single `"voice-mode"` player key. `speakReply`/`cancelReply` are
  // stable identities (so composing them into the stream's `onComplete` doesn't
  // re-subscribe); `speakingReply` drives the `speaking` scene mode.
  const { speak: speakReply, cancel: cancelReply, speaking: speakingReply } = useAutoSpeak();
  // The latest voice-mode on/off, read inside the (stable) completion handler
  // without re-creating it. Assigned just below, once `voice` exists.
  const voiceActiveRef = useRef(false);

  // Bumped once per finished turn so the scene can fire its completion flash
  // (Tier 3). Kept separate from the transcript so an empty-but-done turn — a pure
  // tool dispatch with no text — still flashes.
  const [completedTick, setCompletedTick] = useState(0);

  const appendAssistant = useCallback(
    ({ turnId, text, toolEvents }: CompletedTurn) => {
      setCompletedTick((t) => t + 1);
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

  const send = (text: string, target?: TaskTarget) => {
    if (!conversationId) return;
    // Barge-in (Decision 6): a new operator message — typed or a spoken final —
    // stops any voice reply mid-playback.
    cancelReply();
    setMessages((prev) => [
      ...prev,
      { id: `u-${crypto.randomUUID()}`, role: "user", text, at: new Date().toISOString() },
    ]);
    // The composer owns `target` (the @mention picker, Fáze 14.2) and clears its own
    // selection once this fires — nothing further to reset here.
    sendMessage.mutate({ body: { conversationId, text, ...(target ? { target } : {}) } });
  };

  // Voice mode (Phase 119a) — hands-free STT over the Web Speech API. A finalized
  // utterance is a chat message: it calls `send` directly, bypassing the composer
  // (Decision 1). ChatScreen-local, ephemeral state (Decision 2) — leaving `/chat`
  // unmounts this and stops the mic. The toggle is rendered only when `supported`.
  const voice = useVoiceMode({ onSend: send });

  // Mirror the live voice-mode flag into the ref the (stable) completion handler
  // reads, and barge-in (Decision 6): toggling voice mode off stops any in-flight
  // reply. Written in an effect, never during render (`react-hooks/refs`).
  // Unmounting is handled inside `useAutoSpeak`'s own cleanup.
  useEffect(() => {
    voiceActiveRef.current = voice.active;
    if (!voice.active) cancelReply();
  }, [voice.active, cancelReply]);

  // Keep the latest turn in view as messages land and tokens stream in.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, stream.text, stream.toolEvents.length]);

  // Fáze 14.5: the ⌘K quick-switcher is an overlay ON TOP of the conversation.
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
      // Gates/memory have nowhere to render inline yet (Rozhodnutí 7's sanctioned
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

  // Composer activity is the only new state this phase adds — everything else the
  // orb needs is already carried by the stream + mutation (see Rozhodnutí 1, Fáze
  // 14.1 of the phase-14 plan).
  const [hasDraft, setHasDraft] = useState(false);

  const thinking = sendMessage.isPending || stream.streaming;
  const isEmpty = messages.length === 0 && !stream.streaming;

  const lastTool = stream.toolEvents[stream.toolEvents.length - 1];

  // The most recently dispatched run's id, across the in-flight turn and the
  // committed transcript (newest first) — always computed so the query below
  // stays an unconditional hook call (React rules). `usePipelineRunQuery` itself
  // no-ops on `null` (`enabled: pipelineRunId !== null`), and shares its cache
  // with `ChatRunCard` (Rozhodnutí 5, Fáze 15.3) — no new polling for a run
  // already rendered inline in the transcript.
  const lastRunRef = findLastRunRef([
    stream.toolEvents,
    ...[...messages].reverse().map((m) => m.toolEvents),
  ]);
  const { data: lastRun } = usePipelineRunQuery(lastRunRef);

  // The agent/pipeline roster: the operator's pinned agents/pipelines/chains first,
  // then the imaged tail of the deduped agent catalog — coloured by category. The
  // WebGL constellation ring is gone (the subsystem web is the centerpiece now); this
  // survives only to colour the dock chips (`buildDock` resolves a run → its entry).
  // Only rebuilt when one of its source catalogs changes.
  const { data: agentCatalog } = useAgentsQuery();
  const { data: pipelineCatalog } = usePipelinesQuery();
  const { data: chainCatalog } = useChainsQuery();
  const { data: pins } = usePinsQuery();
  const agents = useMemo(
    () =>
      buildConstellation({
        agents: agentCatalog ?? [],
        pipelines: pipelineCatalog ?? [],
        chains: chainCatalog ?? [],
        pins: pins ?? [],
      }),
    [agentCatalog, pipelineCatalog, chainCatalog, pins],
  );

  // The dock (Tier 5) — the running/queued agents & pipelines from the live runs
  // feed (kept fresh by the shared RunEventsProvider bus), never the full roster.
  const { runs } = useRunsQuery();
  const dock = useMemo(() => buildDock(runs, agents), [runs, agents]);

  // The subsystem web (Phase 83): the 8 named subsystems + live status, polled by
  // `useSubsystemsQuery` (Phase 80/82). Selection is local — clicking a node just
  // toggles its ring for now; Phase 84's drawer will read `selectedSubsystemId` to
  // render the subsystem's detail alongside the transcript.
  const { data: subsystems } = useSubsystemsQuery();
  const [selectedSubsystemId, setSelectedSubsystemId] = useState<SubsystemId | null>(null);
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

  const errorMode = stream.error !== null || sendMessage.isError;
  const waitingApproval = lastRun !== undefined && WAITING_APPROVAL_STATUSES.has(lastRun.status);

  const mode: SceneMode = errorMode
    ? "error"
    : waitingApproval
      ? "waiting-approval"
      : lastTool?.status === "started" && stream.streaming
        ? "tool"
        : stream.streaming && stream.text.length > 0
          ? "streaming"
          : sendMessage.isPending || stream.streaming
            ? "thinking"
            : // `speaking` (Phase 119b): the turn is done, its voice reply is
              // playing. Sits below the live-turn states (thinking/streaming/tool
              // still win while the turn is in flight) and above listening/idle.
              speakingReply
              ? "speaking"
              : // `listening` is driven by REAL mic state while voice mode is on
                // (Phase 119a); otherwise it falls back to the composer draft.
                (voice.active && voice.listening) || hasDraft
                ? "listening"
                : "idle";

  const time = new Date(now);
  const timeStr = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;

  return (
    <div
      aria-label={t("title")}
      className="relative flex h-full w-full flex-col overflow-hidden font-sans"
      data-testid={ChatScreenTestId.Root}
    >
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

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className="relative z-20 flex shrink-0 items-center justify-between border-b border-border px-[22px] py-[13px]">
        <Stack align="center" direction="row" gap="100">
          <Icon name="butlerSign" size="md" tone="accent" />
          <Typography mono size="sm" tone="accent" tracking="widest" type="note">
            {t("modeLabel")}
          </Typography>
          <StatusDot pulse={MODE_DOT[mode].pulse} size="75" tone={MODE_DOT[mode].tone} />
        </Stack>

        <Typography mono size="md" type="subtitle" weight="semibold">
          {timeStr}
        </Typography>

        <Stack align="center" direction="row" gap="100">
          {voice.supported && (
            <VoiceToggleButton active={voice.active} onToggle={voice.toggle} />
          )}
          <Container width="220px">
            <SearchBar
              ariaLabel={t("palette.openAria")}
              onClick={openPalette}
              placeholder={t("palette.placeholder")}
              shortcut="⌘K"
            />
          </Container>
          {messages.length > 0 && (
            <button
              className="flex cursor-pointer items-center gap-[7px] rounded-sm border border-border px-[14px] py-[7px] font-mono text-xs text-foreground-dim transition-colors hover:border-accent hover:text-foreground"
              data-testid={ChatScreenTestId.NewChat}
              onClick={onNewChat}
              type="button"
            >
              <Icon name="plus" size="xs" />
              {t("newChat")}
            </button>
          )}
          <button
            className="flex cursor-pointer items-center gap-[7px] rounded-sm border border-border px-[14px] py-[7px] font-mono text-xs text-foreground-dim transition-colors hover:border-accent hover:text-foreground"
            data-testid={ChatScreenTestId.Close}
            onClick={onClose}
            type="button"
          >
            <Icon name="grid" size="xs" />
            {t("close")}
          </button>
        </Stack>
      </div>

      {/* The living cosmic scene, filling the page — the text-reactive orb (at half
          scale, so the subsystem web can ring it) and the procedural nebula. Sits
          behind every interactive surface (its own canvas layers are
          pointer-events:none); the transcript floats over it in a legibility-
          protected band. */}
      <CosmicScene
        completedTick={completedTick}
        dock={dock}
        mode={mode}
        onSelectSubsystem={setSelectedSubsystemId}
        pipelines={pipelineCatalog ?? []}
        runs={runs}
        selectedSubsystemId={selectedSubsystemId}
        streamChars={stream.streaming ? stream.text.length : 0}
        subsystems={subsystems ?? []}
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
        <div className="relative z-10 flex h-full w-full flex-col items-center justify-end">
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
            className="relative z-10 flex h-1/2 w-full max-w-[720px] flex-col overflow-y-auto px-5 py-8"
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
          Phase 95: the 8 subsystems are now REAL WebGL mini-orbs (siblings of the
          central orb, tinted per subsystem) rendered inside `CosmicScene` above,
          ringed by a WebGL net that hugs the central orb. Their interactive/a11y
          surface — hit-targets, labels, badges, selection ring — lives in the
          `SubsystemOrbsOverlay` that `CosmicScene` renders, positioned from the
          controller's per-frame projections. The retired SVG `SubsystemWeb` overlay
          is gone; its `pipelines`/`runs`-driven handoff particles are restored in
          WebGL by phase 97, fed straight into `CosmicScene` below (same catalogs,
          same `onRunEvent` mapping — no new query). Selection still opens the
          drawer below. */}

      {/* ── Composer ─────────────────────────────────────────────────
          Phase 38: the unified `CommandLine` launcher in send-delegation mode
          (`onSubmit`) — same growable input + @mention picker as the task
          launcher, `chrome={false}` (this bar is its own frame already), and
          `showAttach={false}` since the chat message API has no attachment
          channel yet (Phase 38 plan §5). */}
      <div className="relative z-20 shrink-0 border-t border-border px-5 py-4">
        <div className="mx-auto max-w-[720px]">
          {/* Voice status strip (Phase 119a) — the listening indicator + live
              interim transcript, ABOVE the composer, never inside it (Decision 1).
              Mounted only while voice mode is on. */}
          <Stack align="stretch" direction="col" gap="100">
            {voice.active && (
              <VoiceStatusStrip interim={voice.interim} listening={voice.listening} />
            )}
            <CommandLine
              showAttach
              chrome={false}
              disabled={thinking}
              label={t("composer.label")}
              onDraftChange={setHasDraft}
              onSubmit={send}
              placeholder={t("composer.placeholder")}
            />
          </Stack>
        </div>
      </div>

      {/* ── Quick-switcher (Fáze 14.5) ──────────────────────────────────
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
    </div>
  );
}
