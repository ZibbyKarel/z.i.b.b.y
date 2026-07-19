import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  Container,
  type IconName,
  SearchMenu,
  type SearchMenuSection,
} from "@zibby/design-system";
import { useAgentsQuery } from "../../agents";
import { usePipelinesQuery } from "../../pipelines";
import { useApprovalsQuery } from "../../approvals";
import { useMemorySearchQuery } from "../../memory/queries";
import type { ChatDetailTarget } from "./ChatDetailDialog";

export enum ChatPaletteTestId {
  Root = "chat-palette",
  Backdrop = "chat-palette-backdrop",
}

export interface ChatPaletteProps {
  /**
   * An agent/pipeline was picked — open its read-only DETAIL in a dialog (Phase
   * 58). ⌘K no longer injects the pick into the composer as an `@mention` target;
   * that job belongs to `CommandLine`'s own inline `@`-search (Phase 45/51), so
   * this stops duplicating it.
   */
  onDetailSelect: (detail: ChatDetailTarget) => void;
  /**
   * Navigate away to a gate/note and close the whole overlay — the sanctioned
   * fallback (Fáze 14.5) until the gates/memory screens have a panel-first view
   * this palette could open in place instead. `/gates` has no per-item deep link
   * today, and the memory screen selects a note via client state, not a route
   * (no `/memory?note=` exists) — both items navigate to the screen itself.
   */
  onNavigate: (href: Route) => void;
  /** Close just the palette (Escape, backdrop click, or after a mention pick). */
  onClose: () => void;
  /**
   * Fire an on-demand briefing generation (F8e — restores the capability
   * `BriefingCard`'s deleted "generate now" control used to own). Unlike every
   * other section here, this is an ACTION with no destination and no detail
   * dialog: picking it fires the mutation and closes the palette, and the
   * briefing itself shows up moments later as a card in the transcript
   * (F8a) — this component renders none of it.
   */
  onGenerateBriefing: () => void;
  /** Generation is not instant — while pending, the entry reflects that
   * instead of silently accepting repeat picks (the gap the operator would
   * otherwise hit: nothing visibly happens, so they fire it again). */
  briefingPending: boolean;
}

/** Case-insensitive substring match — mirrors `CommandLine`'s mention-picker filter. */
function matchesQuery(query: string, ...fields: Array<string | undefined>): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some((f) => f?.toLowerCase().includes(q));
}

/**
 * The chat's quick-switcher (⌘K) — a centered `SearchMenu` overlaid on top of the
 * conversation (Fáze 14.5), never a navigation away from it except for the two
 * sections that have nowhere else to render yet (gates, memory — see
 * {@link ChatPaletteProps.onNavigate}). Picking an agent/pipeline opens its
 * read-only DETAIL in a dialog (Phase 58, see {@link ChatPaletteProps.onDetailSelect})
 * rather than injecting an @mention target into the composer — that inline job now
 * belongs solely to `CommandLine`'s own `@`-search (Phase 45/51).
 */
export function ChatPalette({
  onDetailSelect,
  onNavigate,
  onClose,
  onGenerateBriefing,
  briefingPending,
}: ChatPaletteProps) {
  const t = useTranslations("chat.palette");
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { data: agents = [], isPending: agentsLoading } = useAgentsQuery();
  const { data: pipelines = [], isPending: pipelinesLoading } = usePipelinesQuery();
  const { data: approvals = [], isPending: approvalsLoading } = useApprovalsQuery();
  const hasQuery = query.trim().length > 0;
  const { data: memoryHits, isFetching: memoryFetching } = useMemorySearchQuery(query);

  const agentSection: SearchMenuSection = {
    id: "agents",
    label: t("sections.agents"),
    items: agents
      .filter((a) => matchesQuery(query, a.name ?? a.id, a.id))
      .map((a) => ({
        id: a.id,
        title: a.name ?? a.id,
        glyph: (a.glyph as IconName | undefined) ?? "bot",
      })),
  };
  const pipelineSection: SearchMenuSection = {
    id: "pipelines",
    label: t("sections.pipelines"),
    items: pipelines
      .filter((p) => matchesQuery(query, p.name, p.id))
      .map((p) => ({ id: p.id, title: p.name, glyph: "flow" as IconName })),
  };
  const gatesSection: SearchMenuSection = {
    id: "gates",
    label: t("sections.gates"),
    items: approvals
      .filter((a) => matchesQuery(query, a.skill, a.action, a.text ?? a.detail))
      .map((a) => ({
        id: a.id,
        title: `${a.skill} · ${a.action}`,
        subtitle: a.text ?? a.detail,
        glyph: "wait" as IconName,
      })),
  };
  const memorySection: SearchMenuSection = {
    id: "memory",
    label: t("sections.memory"),
    items: (memoryHits?.results ?? []).map((hit) => ({
      id: hit.id,
      title: hit.title,
      subtitle: hit.snippet,
      glyph: "brain" as IconName,
    })),
  };
  // A single-item "section" for the on-demand briefing action (F8e). Extra,
  // untranslated aliases widen the match beyond the visible title so the
  // operator finds it typing either language, per the phase brief.
  const briefingSection: SearchMenuSection = {
    id: "briefing",
    label: t("sections.briefing"),
    items: matchesQuery(
      query,
      t("actions.generateBriefing"),
      "briefing",
      "report",
      "přehled",
      "shrnutí",
    )
      ? [
          {
            id: "generate",
            title: briefingPending
              ? t("actions.generatingBriefing")
              : t("actions.generateBriefing"),
            glyph: "spark" as IconName,
          },
        ]
      : [],
  };

  const loading =
    agentsLoading || pipelinesLoading || approvalsLoading || (hasQuery && memoryFetching);

  const selectItem = (sectionId: string, itemId: string) => {
    if (sectionId === "agents") {
      const agent = agents.find((a) => a.id === itemId);
      if (agent) {
        onDetailSelect({ kind: "agent", agent });
        onClose();
      }
      return;
    }
    if (sectionId === "pipelines") {
      const pipeline = pipelines.find((p) => p.id === itemId);
      if (pipeline) {
        onDetailSelect({ kind: "pipeline", pipeline });
        onClose();
      }
      return;
    }
    if (sectionId === "gates") {
      onNavigate("/gates");
      return;
    }
    if (sectionId === "memory") {
      onNavigate("/memory");
      return;
    }
    if (sectionId === "briefing") {
      // Already in flight — the item's own label already says so; a repeat
      // pick is a no-op rather than a second POST.
      if (briefingPending) return;
      onGenerateBriefing();
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop is a sibling (not a wrapper) of the card below, at a lower
          z-index — a click on the card never bubbles to it, so only an outside
          click closes the palette. */}
      <Container
        bottom="0"
        data-testid={ChatPaletteTestId.Backdrop}
        left="0"
        onClick={onClose}
        position="fixed"
        right="0"
        top="0"
        zIndex={48}
      />
      <Container
        data-testid={ChatPaletteTestId.Root}
        left="calc(50% - 320px)"
        position="fixed"
        top="18%"
        width="640px"
        zIndex={49}
      >
        <Card animate="scale" background="surface" radius="lg" shadow="modal">
          <Container padding="150">
            <SearchMenu
              ariaLabel={t("ariaLabel")}
              emptyLabel={t("empty")}
              inputRef={inputRef}
              loading={loading}
              onOpenChange={setMenuOpen}
              onSelect={selectItem}
              onValueChange={setQuery}
              open={menuOpen}
              placeholder={t("placeholder")}
              sections={[
                agentSection,
                pipelineSection,
                gatesSection,
                briefingSection,
                memorySection,
              ]}
              value={query}
            />
          </Container>
        </Card>
      </Container>
    </>
  );
}
