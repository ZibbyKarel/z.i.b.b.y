"use client";

import type { Route } from "next";
import type { Ref } from "react";
import type { SubsystemId } from "@zibby/contracts";
import { Container, GlassSurface, Stack } from "@zibby/design-system";
import { LimitsRings } from "../../../components/layout/LimitsRings/LimitsRings";
import type { ChatDetailTarget } from "./ChatDetailDialog";
import { ChatSearch, type ChatSearchHandle } from "./ChatSearch";
import { LangSwitch } from "./LangSwitch";
import { StatusPill } from "./StatusPill";

/**
 * The design's top band is a fixed 56px row (`VcTopBarD`: `height: 56`), not a
 * padded one — its elements are vertically centred inside it and the tallest of
 * them (the 41px limits pill) does not grow the band. `ChatScreen` insets the orb
 * ellipse by the same number.
 */
export const CHAT_TOPBAR_HEIGHT_PX = 56;

const CHAT_TOPBAR_HEIGHT = `${CHAT_TOPBAR_HEIGHT_PX}px`;

/** Design `LimitsTopBar`: a 41px-tall glass pill, its content vertically centred. */
const GLASS_ROW_STYLE = { height: "41px", display: "flex", alignItems: "center" } as const;

/** Design's trailing 40×40 glass disc (there it links to Velín-C; here: the language switch). */
const GLASS_DISC_STYLE = {
  height: "40px",
  minWidth: "40px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
} as const;

export enum ChatTopBarTestId {
  Root = "chat-top-bar",
  Search = "chat-top-bar-search",
  Lang = "chat-top-bar-lang",
}

export interface ChatTopBarProps {
  /** Forwarded up from `ChatScreen` so its ⌘K handler can open+focus the search. */
  searchRef: Ref<ChatSearchHandle>;
  onDetailSelect: (detail: ChatDetailTarget) => void;
  onSelectSubsystem: (id: SubsystemId) => void;
  onOpenRun: (runId: string) => void;
  onNavigate: (href: Route) => void;
  onGenerateBriefing: () => void;
  briefingPending: boolean;
}

/**
 * The Velín-D glass top bar — four elements, left→right: the live status pill
 * (+ the phase-3a flyout), the inline ⌘K search (Workstream B), the Claude limits
 * gauge, and the language selector. A 56px transparent header; every element
 * carries its own single GlassSurface (no mode sign, no clock — not in the
 * design). `ChatSearch` owns its OWN glass pill chrome (it animates its width on
 * focus/click), so — unlike the other three elements — it is NOT wrapped in a
 * second `GlassSurface` here; the surrounding `Container` only carries the
 * stable `ChatTopBarTestId.Search` test hook.
 *
 * F9/O7: this used to carry a fifth element, a "switch to HUD" icon — dropped
 * here. `/overview` (its original destination) was deleted in F8d, and every
 * surviving route is already immersive, so there was no more "classic HUD"
 * screen left for it to switch to; F8d had already repointed it at `/chat`,
 * this component's own page, which made it a control that navigates to the
 * page you're already on. The operator's call (O7): remove the element
 * outright rather than leave a broken affordance in place.
 */
export function ChatTopBar({
  searchRef,
  onDetailSelect,
  onSelectSubsystem,
  onOpenRun,
  onNavigate,
  onGenerateBriefing,
  briefingPending,
}: ChatTopBarProps) {
  return (
    <Container height={CHAT_TOPBAR_HEIGHT}>
      <Stack
        align="center"
        as="header"
        data-testid={ChatTopBarTestId.Root}
        direction="row"
        gap="125"
        justify="between"
        style={{ height: "100%", position: "relative" }}
      >
        <GlassSurface radius="pill">
          <StatusPill />
        </GlassSurface>

        {/* Absolutely centred, not a flow item: the design centres the search on
            the VIEWPORT, and a flow item would drift with the status pill's
            content-driven width (its label and counters change at runtime). */}
        <Container
          data-testid={ChatTopBarTestId.Search}
          left="50%"
          position="absolute"
          style={{ transform: "translateX(-50%)" }}
        >
          <ChatSearch
            briefingPending={briefingPending}
            onDetailSelect={onDetailSelect}
            onGenerateBriefing={onGenerateBriefing}
            onNavigate={onNavigate}
            onOpenRun={onOpenRun}
            onSelectSubsystem={onSelectSubsystem}
            ref={searchRef}
          />
        </Container>

        <Stack align="center" direction="row" gap="125">
          <GlassSurface radius="pill" style={GLASS_ROW_STYLE}>
            <LimitsRings />
          </GlassSurface>

          {/* Design's third top-right element is a 40×40 glass disc; the compact
              code-only language switch takes that slot, so it carries the same
              pill glass chrome. The testid stays on the wrapper. */}
          <GlassSurface data-testid={ChatTopBarTestId.Lang} radius="pill" style={GLASS_DISC_STYLE}>
            <LangSwitch size="md" />
          </GlassSurface>
        </Stack>
      </Stack>
    </Container>
  );
}
