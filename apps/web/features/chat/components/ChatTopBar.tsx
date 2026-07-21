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
    <Container padding={["150", "200"]}>
      <Stack
        align="center"
        as="header"
        data-testid={ChatTopBarTestId.Root}
        direction="row"
        gap="150"
        justify="between"
      >
        <GlassSurface radius="pill">
          <StatusPill />
        </GlassSurface>

        <Container data-testid={ChatTopBarTestId.Search}>
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

        <Stack direction="row" gap="150">
          <GlassSurface radius="pill">
            <LimitsRings />
          </GlassSurface>

          {/* Design (topbar 1:1) drops the glass wrapper here; the testid lives on
              a plain Container so the compact code-only switch stays transparent. */}
          <Container data-testid={ChatTopBarTestId.Lang}>
            <LangSwitch size="md" />
          </Container>
        </Stack>
      </Stack>
    </Container>
  );
}
