/* eslint-disable react/forbid-dom-props -- A bespoke JARVIS-style HUD surface:
   scanline/grid overlays and the ambient radial backdrop are decorative inline
   styles with no DS prop equivalent — sanctioned escape hatch, file-level. */
"use client";

import type { ChatMessage as ChatMessageType, SubsystemId } from "@zibby/contracts";
import { Container, MAIN_CONTENT_ID } from "@zibby/design-system";
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
import { useAgentsQuery } from "../../agents";
import { useGenerateBriefingMutation } from "../../briefing";
import { usePipelinesQuery } from "../../pipelines";
import { useRunAvatarMap, useRunGlyphMap, useRunsQuery } from "../../runs/queries/useRunsQuery";
import { runAvatar, runGlyph } from "../../runs/run";
import { useRunActions } from "../../runs/useRunActions";
import { SubsystemDrawer } from "../../subsystems/components/SubsystemDrawer/SubsystemDrawer";
import { useSubsystemsQuery } from "../../subsystems/queries/useSubsystemsQuery";
import { ChatBottomBar } from "./ChatBottomBar";
import { ChatDetailDialog, type ChatDetailTarget } from "./ChatDetailDialog";
import { ChatLiveLog } from "./ChatLiveLog";
import type { ChatSearchHandle } from "./ChatSearch";
import { ChatTaskDetailColumn } from "./ChatTaskDetailColumn";
import { ChatTasksPanel } from "./ChatTasksPanel";
import { ChatToolDock } from "./ChatToolDock";
import { ChatTopBar } from "./ChatTopBar";
import { CoreOverviewDialog } from "./CoreOverviewDialog";
import { SubsystemOrbMap } from "./SubsystemOrbMap";

export enum ChatScreenTestId {
  Root = "chat-screen",
}

/** The chat top-bar band height — the orb ellipse is inset by this so its top
 *  ring clears the bar instead of sitting under it (the bar is a z-20 overlay
 *  over the full-screen map). */
const CHAT_TOPBAR_INSET = 56;

/** The orb ellipse's bottom inset — reserves room for the Velín-D floating
 *  chrome anchored to the bottom edge (the bottom-center `ChatBottomBar`, whose
 *  expanded chat slot is tall, plus the bottom-right `ChatLiveLog`) so the lower
 *  mini-orbs don't collide with them. Eyeballed for the Velín-D shell; a
 *  measured-ref refinement (read the bar's real height) is phase-5 polish. */
const CHAT_BOTTOM_INSET = 320;

export interface ChatScreenProps {
  /**
   * The conversation this thread owns. Minted once by {@link ChatProvider} and
   * preserved across leaving `/chat` and coming back; only "New chat" mints a
   * fresh one. Flows straight through to {@link ChatBottomBar}'s chat dock.
   */
  conversationId: string | null;
  /**
   * The transcript, owned by {@link ChatProvider} so it survives navigating away
   * from `/chat` and back. Flows through to the bottom bar's chat dock.
   */
  messages: ChatMessageType[];
  /** Append/replace transcript turns (lifted setter from the provider). */
  onMessagesChange: Dispatch<SetStateAction<ChatMessageType[]>>;
  /** Start a fresh thread: clears the transcript and mints a new conversation. */
  onNewChat: () => void;
}

/**
 * The chat-first conversational surface, rendered by the `/chat` route inside the
 * dashboard shell — the Velín-D "velín": a JARVIS-style HUD with an ambient
 * {@link SubsystemOrbMap} filling the page (an ellipse of subsystem orbs ringing
 * the central conversational core), the glass {@link ChatTopBar} chrome, a
 * top-right {@link ChatToolDock}, a bottom-center {@link ChatBottomBar}
 * (chat / run-a-task / add-a-note composers) and a bottom-right {@link ChatLiveLog}.
 *
 * The conversation itself lives inside the bottom bar's chat dock (see
 * {@link ChatDock}), which owns the ONLY chat stream: it appends the operator's
 * turn optimistically on send and the assistant's turn from the stream's `done`.
 * This screen keeps no stream of its own — the orb-map "thinking" pulse is bridged
 * up from the dock via `onStreamingChange` (see the `thinking` state below).
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

  // The orb-map "thinking" pulse. The chat stream lives in the bottom bar's chat
  // dock now (this screen keeps none of its own — a second `useChatStream` on the
  // same conversation would open a duplicate EventSource), so the dock reports its
  // in-flight state up through `onStreamingChange`; its effect cleanup fires
  // `false` when the dock unmounts, clearing the pulse.
  const [thinking, setThinking] = useState(false);

  // Workstream B: the ⌘K inline top search (`ChatSearch`) owns its own open/close
  // state — this screen only needs an imperative handle to open+focus it.
  const searchRef = useRef<ChatSearchHandle>(null);

  // A result picked in the search (agents/pipelines) opens its read-only DETAIL
  // here in a dialog (Phase 58). `undefined` = no dialog open.
  const [detailTarget, setDetailTarget] = useState<ChatDetailTarget | undefined>(undefined);
  const handleDetailSelect = useCallback((detail: ChatDetailTarget) => {
    setDetailTarget(detail);
  }, []);
  const handleSearchNavigate = useCallback(
    (href: Route) => {
      // Memory (and every other navigate-away kind) has nowhere to render inline
      // yet — navigating there leaves `/chat`, same as any other nav-rail jump.
      router.push(href);
    },
    [router],
  );

  // F8e: the ⌘K "generate briefing now" trigger — restores the capability
  // regression F8d named (deleted `/overview`'s `BriefingCard` took its only
  // caller of `useGenerateBriefingMutation` with it). F8a already made
  // generation append the briefing to the chat transcript as an assistant turn
  // SERVER-SIDE (`ChatBriefingSinkService`), but that write lands in the JSONL
  // file, not in this screen's in-memory `messages` — the transcript is read
  // once on mount, never refetched on a live mutation (see
  // `useSendChatMessageMutation`'s docblock on the same constraint for chat
  // replies). So the success handler mirrors the sink's own shape locally and
  // appends it here, exactly like `useChatStream` appends streamed replies
  // in-memory rather than refetching.
  const generateBriefingMutation = useGenerateBriefingMutation();
  const triggerBriefing = useCallback(() => {
    if (generateBriefingMutation.isPending) return;
    generateBriefingMutation.mutate(
      { body: {} },
      {
        onSuccess: ({ body: { briefing } }) => {
          onMessagesChange((prev) => [
            ...prev,
            {
              id: `msg_${crypto.randomUUID()}`,
              role: "assistant",
              text: briefing.headline,
              at: briefing.generatedAt,
              briefing,
            },
          ]);
        },
      },
    );
  }, [generateBriefingMutation, onMessagesChange]);

  // ⌘K / Ctrl+K opens+focuses the inline top search — `ChatSearch` owns its own
  // Esc-to-close (and outside-click/backdrop-click) handling, so there is no Esc
  // branch left here for it.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // The pipeline catalog — still needed to feed `SubsystemOrbMap`'s active-run
  // counts (it maps a run's `owner` pipeline to its `ownerSubsystem`).
  const { data: pipelineCatalog } = usePipelinesQuery();
  // The agent catalog — Phase 126g: an agent-kind run's `owner` is its agent id,
  // resolved against `Agent.ownerSubsystem` the same way a pipeline-kind run's
  // `owner` is resolved against `Pipeline.ownerSubsystem` above.
  const { data: agentCatalog } = useAgentsQuery();

  // The running/queued runs feed (kept fresh by the shared RunEventsProvider bus).
  const { runs } = useRunsQuery();

  // The subsystem web (Phase 83): the 8 named subsystems + live status. Selection is
  // local — clicking a node reports its id, and the drawer below reads
  // `selectedSubsystemId` to render the subsystem's detail. There's no selection ring
  // on the node itself (Task 13) — the drawer opening IS the selection feedback.
  const { data: subsystems } = useSubsystemsQuery();
  const [selectedSubsystemId, setSelectedSubsystemId] = useState<SubsystemId | null>(null);
  // Task C1: clicking the central orb opens the whole-federation overview dialog
  // (`CoreOverviewDialog`) instead of the per-subsystem drawer below. Picking a
  // subsystem row inside it reuses the EXISTING `setSelectedSubsystemId` — it closes
  // the overview and opens the same drawer a direct mini-orb click would.
  const [coreOpen, setCoreOpen] = useState(false);
  // Resolved against the live status list so the drawer always shows fresh
  // state/counts (Phase 84) — a dangling id just renders nothing rather than stale.
  const selectedSubsystem = subsystems?.find((s) => s.id === selectedSubsystemId) ?? null;

  // Phase 100: the left tasks panel's selection — a click opens the run's detail
  // inline, in a column beside the panel. Re-clicking the already-selected row
  // toggles it off. Resolved against the same `runs` feed — no second fetch.
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

  // Any overlay (detail dialog / subsystem drawer / run detail / core overview)
  // dims the floating chrome — the shared `dimmed` contract every Velín-D widget
  // honours. The search's own panel+backdrop are self-contained (Workstream B)
  // and don't need to fold into this.
  const overlayOpen =
    detailTarget != null || selectedSubsystem != null || selectedRun != null || coreOpen;

  return (
    <main
      aria-label={t("title")}
      className="relative flex h-full w-full flex-col overflow-hidden font-sans"
      data-testid={ChatScreenTestId.Root}
      id={MAIN_CONTENT_ID}
      tabIndex={-1}
    >
      {/* The immersive orb map's clean radial backdrop, centered at 50% 42% (the
          app-shell's shared --gradient-scene token is top-anchored for other pages
          — this page needs its own center to frame the orb map). Sits behind
          `SubsystemOrbMap`; shows through at any edge its DOM layers don't cover. */}
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

      {/* ── Top bar ──────────────────────────────────────────────────────
          The Velín-D glass chrome: `ChatTopBar` owns its own five elements —
          status pill, search trigger, limits gauge, HUD switch and language
          switch. */}
      <div className="relative z-20 shrink-0 px-[22px]">
        <ChatTopBar
          briefingPending={generateBriefingMutation.isPending}
          onDetailSelect={handleDetailSelect}
          onGenerateBriefing={triggerBriefing}
          onNavigate={handleSearchNavigate}
          onOpenRun={setSelectedRunId}
          onSelectSubsystem={setSelectedSubsystemId}
          searchRef={searchRef}
        />
      </div>

      {/* ── Top-right tool dock (Velín-D `VcDockGroup`) ───────────────────
          A glass island pinned to the top-right, just under the top bar
          (design `right:24 top:68`), floating above the orb map. `pointerEvents`
          re-enables clicks through the page's ambient pointer-events-none scene. */}
      <Container pointerEvents="auto" position="absolute" right="24px" top="72px" zIndex={20}>
        <ChatToolDock />
      </Container>

      {/* The immersive orb map, filling the page. Sits behind every interactive
          surface (its DOM layers are pointer-events:none apart from the orbs
          themselves). Insets keep the ellipse clear of the chrome: the top bar
          (`CHAT_TOPBAR_INSET`) and the bottom floating bar + live log
          (`CHAT_BOTTOM_INSET`). The `thinking` pulse is bridged up from the bottom
          bar's chat dock (this screen owns no stream). */}
      <SubsystemOrbMap
        agents={agentCatalog ?? []}
        insets={{ top: CHAT_TOPBAR_INSET, left: 0, right: 0, bottom: CHAT_BOTTOM_INSET }}
        onOpenCore={() => setCoreOpen(true)}
        onSelectSubsystem={setSelectedSubsystemId}
        pipelines={pipelineCatalog ?? []}
        runs={runs}
        subsystems={subsystems ?? []}
        thinking={thinking}
      />

      {/* ── Main area: the left tasks gutter + inline drawers over the scene ─
          This outer wrapper deliberately carries NO explicit z-index — only
          `relative` (a containing block for the left tasks panel below, via its
          `absolute` positioning). The subsystem detail modal no longer depends
          on this wrapper at all as of Phase 125 — it's `position: fixed` with
          its own z-40, escaping this stacking context entirely (see the mount
          comment further down). */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* `pointer-events-none` on this wrapper so the scene stays clickable
            everywhere outside its populated regions (the left panel re-enables
            pointer events on itself); orbs/core stay reachable through it. */}
        <div className="pointer-events-none relative z-10 flex h-full w-full flex-col items-center justify-end">
          {/* ── Left panel: ALL tasks in scope (Phase 57) ──────────────────
              A `z`-raised fixed-width column pinned to the left, above the scene.
              Hidden below `lg` so it never crowds the map on a narrow viewport. */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-20 hidden w-[300px] flex-col p-4 lg:flex">
            <div className="pointer-events-auto">
              <ChatTasksPanel onSelectRun={selectRun} selectedRunId={selectedRunId} />
            </div>
          </div>
        </div>

        {/* ── Subsystem detail modal (Phase 84, reworked Phase 125) ────────
            Was a docked-right, no-backdrop panel through Phase 99; now a true
            modal over the whole Velín canvas — `SubsystemDrawer` renders its
            own `position: fixed` backdrop (z-40), which escapes this
            wrapper's stacking context on its own, so no special mounting
            position is needed here any more. Selecting a subsystem in the web
            above still swaps this drawer's content rather than opening a
            second one. */}
        {selectedSubsystem && (
          <SubsystemDrawer
            onClose={() => setSelectedSubsystemId(null)}
            subsystem={selectedSubsystem}
          />
        )}

        {/* ── Task detail modal (Phase 100, frame Phase 122, modal Phase 126) ──
            A click in `ChatTasksPanel` (the 300px left gutter above) opens the
            run's detail as a true modal over the whole Velín canvas — same
            treatment `SubsystemDrawer` got in Phase 125.
            `ChatTaskDetailColumn` renders its own `position: fixed` backdrop
            (z-40), which escapes this wrapper's stacking context on its own, so
            no special mounting position is needed here. It now covers the left
            gutter while open, same as the subsystem drawer already does. */}
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

      {/* ── Bottom-center bar (Velín-D `VcBottomBar`) ─────────────────────
          The three floating composers — chat (default), run-a-task, add-a-note —
          in a bottom-centered row (design `left:50% bottom:26 translateX(-50%)`).
          The chat dock inside it owns the conversation stream and bridges its
          `thinking` state back up to the orb-map pulse. */}
      <Container
        bottom="26px"
        left="50%"
        pointerEvents="auto"
        position="absolute"
        style={{ transform: "translateX(-50%)" }}
        zIndex={30}
      >
        <ChatBottomBar
          conversationId={conversationId}
          dimmed={overlayOpen}
          messages={messages}
          onMessagesChange={onMessagesChange}
          onNewChat={onNewChat}
          onStreamingChange={setThinking}
        />
      </Container>

      {/* ── Bottom-right live log (Velín-D `VcLiveLog`) ───────────────────
          The system activity feed as a collapsible glass widget (design
          `right:24 bottom:24`), reusing the HUD RightRail's data wiring. */}
      <Container bottom="24px" pointerEvents="auto" position="absolute" right="24px" zIndex={20}>
        <ChatLiveLog dimmed={overlayOpen} />
      </Container>

      {/* ── Result detail (Phase 58) ────────────────────────────────────
          A pick in the ⌘K top search (Workstream B) opens the agent/pipeline's
          read-only detail here — a viewing dialog, never an edit surface. */}
      {detailTarget && (
        <ChatDetailDialog detail={detailTarget} onClose={() => setDetailTarget(undefined)} />
      )}

      {/* ── ZIBBY overview (Task C1) ─────────────────────────────────────
          Clicking the central orb opens this whole-federation snapshot. Picking a
          subsystem row inside it reuses the existing selection state, so it closes
          the overview and opens the same `SubsystemDrawer` a direct mini-orb click
          would. */}
      <CoreOverviewDialog
        onClose={() => setCoreOpen(false)}
        onSelectSubsystem={(id) => {
          setCoreOpen(false);
          setSelectedSubsystemId(id);
        }}
        open={coreOpen}
      />
    </main>
  );
}
