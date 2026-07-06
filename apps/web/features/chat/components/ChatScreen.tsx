/* eslint-disable react/forbid-dom-props -- A bespoke full-screen HUD takeover
   (like the old Voice UI): radial backdrop, scanline/grid overlays, the ambient
   orb behind the conversation and the transcript's top fade-mask are decorative
   inline styles with no DS prop equivalent — sanctioned escape hatch, file-level. */
"use client";

import type { Route } from "next";
import type { ChatMessage as ChatMessageType, ChatToolEvent, TaskTarget } from "@zibby/contracts";
import { Container, Icon, SearchBar, Stack, Typography } from "@zibby/design-system";
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
import { usePipelineRunQuery } from "../../pipelines";
import { buildConstellation } from "../scene/constellation";
import { type CompletedTurn, useChatStream } from "../hooks/useChatStream";
import { useSendChatMessageMutation } from "../mutations/useSendChatMessageMutation";
import { CosmicScene } from "../scene/CosmicScene";
import type { SceneMode } from "../scene/sceneTypes";
import { ChatComposer } from "./ChatComposer";
import { ChatPalette } from "./ChatPalette";
import { ChatSidePanel } from "./ChatSidePanel";
import { ChatTranscript } from "./ChatTranscript";

const ACCENT = "var(--color-accent)";

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
  PanelToggle = "chat-screen-panel-toggle",
}

export interface ChatScreenProps {
  /**
   * The conversation this thread owns. Minted once by {@link ChatProvider} and
   * preserved across close + reopen; only "New chat" mints a fresh one.
   */
  conversationId: string | null;
  /** The transcript, owned by {@link ChatProvider} so it survives close + reopen. */
  messages: ChatMessageType[];
  /** Append/replace transcript turns (lifted setter from the provider). */
  onMessagesChange: Dispatch<SetStateAction<ChatMessageType[]>>;
  /** Start a fresh thread: clears the transcript and mints a new conversation. */
  onNewChat: () => void;
  /** Close the overlay (Esc / header close). */
  onClose: () => void;
}

/**
 * The chat-first conversational overlay — a JARVIS-style full-screen takeover with
 * a radial backdrop, an ambient {@link ChatOrb} behind the conversation, a
 * scrollable transcript that fades into nothing at the top (scroll up to read back
 * to the start), and the text composer pinned at the bottom.
 *
 * The conversation lives in the provider's client state (passed in via `messages` /
 * `onMessagesChange`) so it survives this overlay unmounting on close: the operator's
 * turn is appended optimistically on send, and the assistant's turn is appended from
 * the stream's `done` (authoritative text + accumulated tool events). The backend
 * still writes every message to the JSONL transcript — the UI just renders what the
 * stream produced rather than refetching, which is what removed the "history
 * disappears after a reply" flash. Reopening shows the same thread; "New chat" is the
 * only reset.
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

  const appendAssistant = useCallback(({ turnId, text, toolEvents }: CompletedTurn) => {
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
  }, [setMessages]);

  const appendError = useCallback((message: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `err-${crypto.randomUUID()}`,
        role: "assistant",
        text: message,
        at: new Date().toISOString(),
      },
    ]);
  }, [setMessages]);

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

  // Fáze 14.5: the activity panel and the ⌘K quick-switcher are mutually exclusive
  // overlays ON TOP of the conversation — opening either closes the other. Both are
  // owned here (not by the panel/palette themselves) so Esc priority and the
  // top-bar toggles all read from one source of truth.
  const [panelOpen, setPanelOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPanel = useCallback(() => {
    setPaletteOpen(false);
    setPanelOpen((v) => !v);
  }, []);
  const openPalette = useCallback(() => {
    setPanelOpen(false);
    setPaletteOpen((v) => !v);
  }, []);

  // A target picked in the palette (agents/pipelines sections) rides into the
  // composer through its `injectedTarget` prop rather than lifting the composer's
  // whole mention-selection state up here — see the doc comment on
  // `ChatComposerProps.injectedTarget` for why.
  const [pendingMentionTarget, setPendingMentionTarget] = useState<TaskTarget | undefined>(
    undefined,
  );
  const handleMentionSelect = useCallback((target: TaskTarget) => {
    setPendingMentionTarget(target);
  }, []);
  const handlePaletteNavigate = useCallback(
    (href: Route) => {
      // Gates/memory have nowhere to render in-overlay yet (Rozhodnutí 7's sanctioned
      // fallback) — navigating away closes the whole conversation, not just the palette.
      setPaletteOpen(false);
      router.push(href);
      onClose();
    },
    [router, onClose],
  );

  // Esc priority: the palette sits on top of the panel, which sits on top of the
  // conversation itself — the topmost open surface is what a single Esc dismisses.
  // Closing the whole overlay also drops `panelOpen`/`paletteOpen` for free (this
  // component unmounts).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (paletteOpen) {
        setPaletteOpen(false);
        return;
      }
      if (panelOpen) {
        setPanelOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [paletteOpen, panelOpen, onClose]);

  // ⌘/Ctrl+K opens the quick-switcher — but ONLY while this overlay is mounted
  // (the effect only exists for the lifetime of ChatScreen). The dashboard's own
  // TopBar `GlobalSearch` keeps its global ⌘K listener mounted underneath this
  // full-screen overlay (it never unmounts), so a plain bubble-phase listener here
  // would ALSO trigger it invisibly behind the chat. Registering on the CAPTURE
  // phase runs before any bubble-phase `window` listener — including
  // GlobalSearch's — so `stopPropagation` here cleanly suppresses it without
  // touching anything outside `features/chat`.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      e.stopPropagation();
      openPalette();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
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

  // The constellation roster — the live agent catalog deduped to real roles and
  // coloured by category (Tier 4). Only rebuilt when the catalog changes.
  const { data: agentCatalog } = useAgentsQuery();
  const agents = useMemo(() => buildConstellation(agentCatalog ?? []), [agentCatalog]);

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
      className="fixed inset-0 z-50 flex flex-col overflow-hidden font-sans"
      data-testid={ChatScreenTestId.Root}
      role="dialog"
      style={{
        background:
          "radial-gradient(ellipse 100% 85% at 50% 48%, #0b1422 0%, var(--color-background) 62%)",
        animation: "v-mode-in 0.42s cubic-bezier(.22,.68,0,1.2)",
      }}
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
          <span
            className="ml-1 inline-block h-1.5 w-1.5 rounded-full transition-all"
            style={{
              background: thinking ? "var(--color-ok)" : ACCENT,
              boxShadow: `0 0 8px ${thinking ? "var(--color-ok)" : ACCENT}`,
            }}
          />
        </Stack>

        <Typography mono size="md" type="subtitle" weight="semibold">
          {timeStr}
        </Typography>

        <Stack align="center" direction="row" gap="100">
          <Container width="220px">
            <SearchBar
              ariaLabel={t("palette.openAria")}
              onClick={openPalette}
              placeholder={t("palette.placeholder")}
              shortcut="⌘K"
            />
          </Container>
          <button
            aria-label={t(panelOpen ? "panel.closeAria" : "panel.openAria")}
            className="flex cursor-pointer items-center gap-[7px] rounded-sm border border-border px-[14px] py-[7px] font-mono text-xs text-foreground-dim transition-colors hover:border-accent hover:text-foreground"
            data-testid={ChatScreenTestId.PanelToggle}
            onClick={openPanel}
            type="button"
          >
            <Icon name="pulse" size="xs" />
            {t("panel.title")}
          </button>
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

      {/* Full-screen living cosmic scene — the text-reactive orb, procedural
          nebula and sub-agent constellation. Sits behind every interactive
          surface (its own canvas layers are pointer-events:none); the transcript
          floats over it in a legibility-protected band. */}
      <CosmicScene
        agents={agents}
        completedTick={completedTick}
        mode={mode}
        streamChars={stream.streaming ? stream.text.length : 0}
      />

      {/* ── Main area: scene behind, scrollable conversation over it ───── */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-end">
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

      {/* ── Composer ────────────────────────────────────────────────── */}
      <div className="relative z-20 shrink-0 border-t border-border px-5 py-4">
        <div className="mx-auto max-w-[720px]">
          <ChatComposer
            disabled={thinking}
            injectedTarget={pendingMentionTarget}
            onDraftChange={setHasDraft}
            onInjectedTargetConsumed={() => setPendingMentionTarget(undefined)}
            onSend={send}
          />
        </div>
      </div>

      {/* ── Activity panel + quick-switcher (Fáze 14.5) ────────────────
          Both float above everything else in the overlay; mounted only while
          open so their own data hooks don't fire until the operator asks. */}
      {panelOpen && <ChatSidePanel onClose={() => setPanelOpen(false)} />}
      {paletteOpen && (
        <ChatPalette
          onClose={() => setPaletteOpen(false)}
          onMentionSelect={handleMentionSelect}
          onNavigate={handlePaletteNavigate}
        />
      )}
    </div>
  );
}
