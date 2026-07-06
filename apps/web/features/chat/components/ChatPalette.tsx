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
import type { TaskTarget } from "@zibby/contracts";
import { useAgentsQuery } from "../../agents";
import { usePipelinesQuery } from "../../pipelines";
import { useApprovalsQuery } from "../../approvals";
import { useMemorySearchQuery } from "../../memory/queries";

export enum ChatPaletteTestId {
  Root = "chat-palette",
  Backdrop = "chat-palette-backdrop",
}

export interface ChatPaletteProps {
  /** An agent/pipeline was picked — insert it as an @mention target in the composer. */
  onMentionSelect: (target: TaskTarget) => void;
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
}

/** Case-insensitive substring match — mirrors `ChatComposer`'s mention-picker filter. */
function matchesQuery(query: string, ...fields: Array<string | undefined>): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some((f) => f?.toLowerCase().includes(q));
}

/**
 * The chat's quick-switcher (⌘K) — a centered `SearchMenu` overlaid on top of the
 * conversation (Fáze 14.5), never a navigation away from it except for the two
 * sections that have nowhere else to render yet (gates, memory — see
 * {@link ChatPaletteProps.onNavigate}). Agents/pipelines reuse the exact @mention
 * target shape `ChatComposer`'s own picker builds (Fáze 14.2), just handed to the
 * composer from outside instead of typed inline.
 */
export function ChatPalette({ onMentionSelect, onNavigate, onClose }: ChatPaletteProps) {
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

  const loading =
    agentsLoading || pipelinesLoading || approvalsLoading || (hasQuery && memoryFetching);

  const selectItem = (sectionId: string, itemId: string) => {
    if (sectionId === "agents") {
      const agent = agents.find((a) => a.id === itemId);
      if (agent) {
        onMentionSelect({ kind: "agent", id: agent.id, name: agent.name ?? agent.id, glyph: agent.glyph });
        onClose();
      }
      return;
    }
    if (sectionId === "pipelines") {
      const pipeline = pipelines.find((p) => p.id === itemId);
      if (pipeline) {
        onMentionSelect({ kind: "pipeline", id: pipeline.id, name: pipeline.name, glyph: "flow" });
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
              sections={[agentSection, pipelineSection, gatesSection, memorySection]}
              value={query}
            />
          </Container>
        </Card>
      </Container>
    </>
  );
}
