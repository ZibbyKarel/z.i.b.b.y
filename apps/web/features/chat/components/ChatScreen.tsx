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
import { ProjectSwitcher } from "../../projects";
import { useRunsQuery } from "../../runs/queries/useRunsQuery";
import { SubsystemDrawer } from "../../subsystems/components/SubsystemDrawer/SubsystemDrawer";
import { SubsystemWeb } from "../../subsystems/components/SubsystemWeb/SubsystemWeb";
import { useSubsystemsQuery } from "../../subsystems/queries/useSubsystemsQuery";
import { CommandLine } from "../../tasks/components/CommandLine/CommandLine";
import { type CompletedTurn, useChatStream } from "../hooks/useChatStream";
import { useSendChatMessageMutation } from "../mutations/useSendChatMessageMutation";
import { buildConstellation } from "../scene/constellation";
import { CosmicScene } from "../scene/CosmicScene";
import { buildDock } from "../scene/dock";
import type { SceneMode } from "../scene/sceneTypes";
import { ChatDetailDialog, type ChatDetailTarget } from "./ChatDetailDialog";
import { ChatPalette } from "./ChatPalette";
import { ChatTasksPanel } from "./ChatTasksPanel";
import { ChatTranscript } from "./ChatTranscript";

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

  const stream = useChatStream(conversationId, {
    onComplete: appendAssistant,
    onError: appendError,
  });

  const send = (text: string, target?: TaskTarget) => {
    if (!conversationId) return;
    setMessages((prev) => [
      ...prev,
      { id: `u-${crypto.randomUUID()}`, role: "user", text, at: new Date().toISOString() },
    ]);
    // The composer owns `target` (the @mention picker, Fáze 14.2) and clears its own
    // selection once this fires — nothing further to reset here.
    sendMessage.mutate({ body: { conversationId, text, ...(target ? { target } : {}) } });
  };

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

  // The constellation roster (Tier 4): the operator's pinned agents/pipelines/
  // chains first, then the imaged tail of the deduped agent catalog — coloured by
  // category. Only rebuilt when one of its source catalogs changes.
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

  // Dispatch signal (Tier 5): each new `tool` event naming an agent bumps a seq the
  // scene fires the beam/flare on. Seen callIds are tracked so the two-phase
  // started→ok pair (same callId) fires exactly once.
  const dispatchSeen = useRef<Set<string>>(new Set());
  const dispatchSeq = useRef(0);
  const [dispatch, setDispatch] = useState<{ seq: number; agentId: string } | undefined>(undefined);
  useEffect(() => {
    for (const ev of stream.toolEvents) {
      if (ev.target?.kind !== "agent") continue;
      const key = ev.callId ?? `${ev.name}:${ev.target.id}`;
      if (dispatchSeen.current.has(key)) continue;
      dispatchSeen.current.add(key);
      dispatchSeq.current += 1;
      setDispatch({ seq: dispatchSeq.current, agentId: ev.target.id });
    }
  }, [stream.toolEvents]);

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
            : hasDraft
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
          <ProjectSwitcher />
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

      {/* The living cosmic scene, filling the page — the text-reactive orb,
          procedural nebula and sub-agent constellation. Sits behind every
          interactive surface (its own canvas layers are pointer-events:none);
          the transcript floats over it in a legibility-protected band. */}
      <CosmicScene
        agents={agents}
        completedTick={completedTick}
        dispatch={dispatch}
        dock={dock}
        mode={mode}
        streamChars={stream.streaming ? stream.text.length : 0}
      />

      {/* ── Subsystem web (Phase 83) ─────────────────────────────────────
          The living centerpiece: 8 fixed nodes on a flattened ellipse around a
          ZIBBY orb, floating over the nebula between the top bar and the
          transcript. A fixed-height band (own `z-20` above the borderless
          `CosmicScene`, same idiom as the top bar/composer) so it never steals
          the transcript's scroll below it. `pipelines`/`runs` (Phase 89) are the
          SAME `pipelineCatalog`/`runs` already fetched above for the constellation
          roster/dock — the particle layer's run→owner resolution rides those
          existing queries, no new request. */}
      <div className="relative z-20 h-[200px] w-full shrink-0">
        <SubsystemWeb
          onSelect={setSelectedSubsystemId}
          pipelines={pipelineCatalog ?? []}
          runs={runs}
          selectedId={selectedSubsystemId}
          subsystems={subsystems ?? []}
        />
      </div>

      {/* ── Main area: scene behind, scrollable conversation over it ───── */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-end">
        {/* ── Left panel: ALL tasks in scope (Phase 57, was running-only in 44) ─
            A `z`-raised fixed-width column pinned to the left, above the scene
            like the top bar / composer. `pointer-events-none` on the gutter so
            the scene stays interactive around it (the panel itself re-enables
            them); hidden below `lg` so it never crowds the centered transcript
            on a narrow viewport. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-20 hidden w-[300px] flex-col p-4 lg:flex">
          <div className="pointer-events-auto">
            <ChatTasksPanel />
          </div>
        </div>

        {/* ── Subsystem drawer (Phase 84) ──────────────────────────────
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

        <div
          className="relative z-10 flex h-1/2 w-full max-w-[720px] flex-col overflow-y-auto px-5 py-8"
          data-testid={ChatScreenTestId.ScrollArea}
          ref={scrollRef}
          style={{
            // A stable half-height box pinned to the bottom (right above the composer):
            // the conversation grows UP from the input — newest turn always at the
            // bottom — and `mt-auto` keeps a short thread bottom-anchored. The mask
            // fades the box's top third into nothing so turns dissolve into the orb's
            // band as they rise (the logo is never overrun) while the lower two-thirds
            // stay fully readable. It still scrolls all the way back to the start —
            // turns near the orb just stay ghosted (declarative mask, scroll intact).
            maskImage: "linear-gradient(to bottom, transparent 0%, #000 34%, #000 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 34%, #000 100%)",
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

      {/* ── Composer ─────────────────────────────────────────────────
          Phase 38: the unified `CommandLine` launcher in send-delegation mode
          (`onSubmit`) — same growable input + @mention picker as the task
          launcher, `chrome={false}` (this bar is its own frame already), and
          `showAttach={false}` since the chat message API has no attachment
          channel yet (Phase 38 plan §5). */}
      <div className="relative z-20 shrink-0 border-t border-border px-5 py-4">
        <div className="mx-auto max-w-[720px]">
          <CommandLine
            showAttach
            chrome={false}
            disabled={thinking}
            label={t("composer.label")}
            onDraftChange={setHasDraft}
            onSubmit={send}
            placeholder={t("composer.placeholder")}
          />
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
