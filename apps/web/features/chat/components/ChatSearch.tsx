"use client";

import type { KeyboardEvent, Ref } from "react";
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import type { SubsystemId } from "@zibby/contracts";
import {
  Button,
  Card,
  CardContent,
  Container,
  GlassSurface,
  type IconName,
  IconTile,
  Kbd,
  MenuSurface,
  SearchInput,
  Stack,
  Tag,
  Typography,
} from "@zibby/design-system";
import { useAgentsQuery } from "../../agents";
import { usePipelinesQuery } from "../../pipelines";
import { useCommandsQuery } from "../../commands/queries";
import { useCompaniesQuery } from "../../companies";
import { useMcpServersQuery } from "../../mcp/queries";
import { useMemorySearchQuery } from "../../memory/queries";
import { useProjectsQuery } from "../../projects";
import { useRunsQuery } from "../../runs/queries/useRunsQuery";
import { runTitle } from "../../runs/run";
import { useSkillsQuery } from "../../skills";
import { SUBSYSTEM_GLYPH } from "../../subsystems/subsystemVisuals";
import { useSubsystemsQuery } from "../../subsystems/queries/useSubsystemsQuery";
import type { ChatDetailTarget } from "./ChatDetailDialog";

export enum ChatSearchTestId {
  Root = "chat-search",
  Input = "chat-search-input",
  Panel = "chat-search-panel",
  Backdrop = "chat-search-backdrop",
  Item = "chat-search-item",
}

type SearchKind =
  | "agent"
  | "pipeline"
  | "subsystem"
  | "task"
  | "memory"
  | "skill"
  | "mcp"
  | "project"
  | "command"
  | "company"
  | "setting"
  | "action";

/** One row of the unified index — built fresh from live query hooks, never from
 * the design mockup's fake `window.*` data (see the design-source header note in
 * `velin-d-search.jsx`). */
interface SearchItem {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle?: string;
  glyph: IconName;
}

export interface ChatSearchHandle {
  /** Opens the panel and focuses the input — the ⌘K entry point (`ChatScreen`). */
  focus: () => void;
}

export interface ChatSearchProps {
  /** Agent/pipeline pick → open its read-only detail dialog, as the old palette did. */
  onDetailSelect: (detail: ChatDetailTarget) => void;
  /** Subsystem pick → open the in-chat subsystem drawer. */
  onSelectSubsystem: (id: SubsystemId) => void;
  /** Task (run) pick → open the in-chat run-detail column. */
  onOpenRun: (runId: string) => void;
  /** Every other kind with nowhere to render inline yet navigates away. */
  onNavigate: (href: Route) => void;
  /** The synthetic "generate briefing" action row. */
  onGenerateBriefing: () => void;
  /** Generation is in flight — the action row reflects that instead of accepting
   * a repeat pick (mirrors the old palette's guard). */
  briefingPending: boolean;
  ref?: Ref<ChatSearchHandle>;
}

/** Case-insensitive substring match over title + subtitle — mirrors the deleted
 * `ChatPalette.matchesQuery`. An empty query matches everything (the panel shows
 * the full capped index on focus, before the operator types anything). */
function matchesQuery(query: string, ...fields: Array<string | undefined>): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some((f) => f?.toLowerCase().includes(q));
}

/** Runaway guard on the rendered list — mirrors `vdBuildSearchIndex`'s own cap. */
const RESULT_CAP = 30;

/**
 * The Velín-D inline top-search (B1–B6, replacing the centered `ChatPalette`): a
 * glass pill that expands on focus/click, dropping a results panel directly below
 * it with a full-page dim backdrop behind — never a centered modal. Built from the
 * broadened live index (B2): agents, pipelines, subsystems, running tasks, memory,
 * skills, MCP servers, projects, commands, companies, a static settings shortcut,
 * and the synthetic "generate briefing" action.
 */
export function ChatSearch({
  onDetailSelect,
  onSelectSubsystem,
  onOpenRun,
  onNavigate,
  onGenerateBriefing,
  briefingPending,
  ref,
}: ChatSearchProps) {
  const t = useTranslations("chat.search");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        setOpen(true);
        inputRef.current?.focus();
      },
    }),
    [],
  );

  const { data: agents = [] } = useAgentsQuery();
  const { data: pipelines = [] } = usePipelinesQuery();
  const { data: subsystems = [] } = useSubsystemsQuery();
  const { runs } = useRunsQuery();
  const { data: skills = [] } = useSkillsQuery();
  const { data: mcpServers = [] } = useMcpServersQuery();
  const { data: projects = [] } = useProjectsQuery();
  const { data: commands = [] } = useCommandsQuery();
  const { data: companies = [] } = useCompaniesQuery();
  const { data: memoryHits } = useMemorySearchQuery(query);

  // Every kind but memory (server-searched separately, below) and the
  // settings/action synthetic rows — folds into one flat pool, filtered
  // client-side (widened past the old palette's agents/pipelines/memory-only set).
  const baseIndex = useMemo<SearchItem[]>(() => {
    const items: SearchItem[] = [];
    for (const a of agents) {
      items.push({
        kind: "agent",
        id: a.id,
        title: a.name ?? a.id,
        subtitle: a.description,
        glyph: (a.glyph as IconName | undefined) ?? "bot",
      });
    }
    for (const p of pipelines) {
      items.push({
        kind: "pipeline",
        id: p.id,
        title: p.name ?? p.id,
        subtitle: p.desc,
        glyph: "flow",
      });
    }
    for (const s of subsystems) {
      items.push({
        kind: "subsystem",
        id: s.id,
        title: s.name,
        subtitle: s.tagline,
        glyph: SUBSYSTEM_GLYPH[s.id],
      });
    }
    for (const r of runs) {
      items.push({
        kind: "task",
        id: r.runId,
        title: runTitle(r),
        subtitle: r.owner,
        glyph: "bolt",
      });
    }
    for (const s of skills) {
      items.push({
        kind: "skill",
        id: s.id,
        title: s.name ?? s.id,
        subtitle: s.desc,
        glyph: (s.glyph as IconName | undefined) ?? "flask",
      });
    }
    for (const m of mcpServers) {
      items.push({ kind: "mcp", id: m.id, title: m.name ?? m.id, subtitle: m.desc, glyph: "plug" });
    }
    for (const p of projects) {
      items.push({
        kind: "project",
        id: p.id,
        title: p.name,
        subtitle: p.desc ?? p.path,
        glyph: "doc",
      });
    }
    for (const c of commands) {
      items.push({
        kind: "command",
        id: c.id,
        title: `/${c.id}`,
        subtitle: c.description,
        glyph: "code",
      });
    }
    for (const c of companies) {
      items.push({ kind: "company", id: c.id, title: c.name, subtitle: c.desc, glyph: "server" });
    }
    items.push({ kind: "setting", id: "settings", title: t("kind.setting"), glyph: "gear" });
    return items;
  }, [agents, pipelines, subsystems, runs, skills, mcpServers, projects, commands, companies, t]);

  const results = useMemo<SearchItem[]>(() => {
    const q = query.trim();
    const filtered = baseIndex.filter((it) => matchesQuery(q, it.title, it.subtitle));
    const memoryItems: SearchItem[] = (memoryHits?.results ?? []).map((hit) => ({
      kind: "memory" as const,
      id: hit.id,
      title: hit.title,
      subtitle: hit.snippet,
      glyph: "brain" as const,
    }));
    const briefingLabel = briefingPending
      ? t("actions.generatingBriefing")
      : t("actions.generateBriefing");
    const actionItems: SearchItem[] = matchesQuery(
      q,
      briefingLabel,
      "briefing",
      "report",
      "přehled",
      "shrnutí",
    )
      ? [{ kind: "action" as const, id: "generate-briefing", title: briefingLabel, glyph: "spark" }]
      : [];
    return [...filtered, ...memoryItems, ...actionItems].slice(0, RESULT_CAP);
  }, [baseIndex, query, memoryHits, briefingPending, t]);

  // Clamp at read time — a result list that shrank between renders never leaves
  // the highlight out of range (mirrors `SearchMenu`'s own approach).
  const activeRow = results.length === 0 ? -1 : Math.min(activeIndex, results.length - 1);

  // Close on outside pointerdown — the backdrop click below also closes, but this
  // catches anything the backdrop doesn't cover (there is none today; kept for
  // parity with `SearchMenu`'s own outside-click contract).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const pick = (item: SearchItem) => {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    switch (item.kind) {
      case "agent": {
        const agent = agents.find((a) => a.id === item.id);
        if (agent) onDetailSelect({ kind: "agent", agent });
        return;
      }
      case "pipeline": {
        const pipeline = pipelines.find((p) => p.id === item.id);
        if (pipeline) onDetailSelect({ kind: "pipeline", pipeline });
        return;
      }
      case "subsystem":
        onSelectSubsystem(item.id as SubsystemId);
        return;
      case "task":
        onOpenRun(item.id);
        return;
      case "memory":
        onNavigate("/memory");
        return;
      case "skill":
        onNavigate(`/skills/${item.id}` as Route);
        return;
      case "mcp":
        onNavigate(`/mcp/${item.id}` as Route);
        return;
      case "project":
        onNavigate(`/projects/${item.id}` as Route);
        return;
      case "command":
        onNavigate(`/commands/${item.id}` as Route);
        return;
      case "company":
        onNavigate(`/companies/${item.id}` as Route);
        return;
      case "setting":
        onNavigate("/settings");
        return;
      case "action":
        // Already in flight — the row's own label already says so; a repeat pick
        // is a no-op rather than a second POST.
        if (briefingPending) return;
        onGenerateBriefing();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      const active = results[activeRow];
      if (active) {
        e.preventDefault();
        pick(active);
      }
    }
  };

  return (
    <>
      {/* Full-page dim backdrop, behind the pill/panel (Root sits at z 41 below) —
          a click closes, same as Escape. */}
      {open && (
        <Container
          bottom="0"
          data-testid={ChatSearchTestId.Backdrop}
          left="0"
          onClick={() => setOpen(false)}
          pointerEvents="auto"
          position="fixed"
          right="0"
          top="0"
          zIndex={40}
        />
      )}
      <Container
        data-testid={ChatSearchTestId.Root}
        position="relative"
        ref={rootRef}
        style={{ transition: "width .32s cubic-bezier(.16,1,.3,1)" }}
        width={open ? "520px" : "230px"}
        zIndex={41}
      >
        <GlassSurface
          radius="pill"
          style={
            open
              ? {
                  boxShadow:
                    "0 0 0 2px color-mix(in srgb, var(--color-accent) 40%, transparent), var(--shadow-glass)",
                }
              : undefined
          }
        >
          <Container
            cursor="text"
            onClick={() => {
              setOpen(true);
              inputRef.current?.focus();
            }}
            padding={["0", "150"]}
          >
            <Stack align="center" direction="row" gap="75">
              <Container grow minW0>
                <SearchInput
                  ariaLabel={t("ariaLabel")}
                  data-testid={ChatSearchTestId.Input}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setOpen(true);
                    setActiveIndex(0);
                  }}
                  onFocus={() => setOpen(true)}
                  onKeyDown={onKeyDown}
                  placeholder={t("placeholder")}
                  ref={inputRef}
                  surface="transparent"
                  value={query}
                />
              </Container>
              {query.length > 0 ? (
                <Button
                  aria-label={t("clearAria")}
                  icon="x"
                  intent="ghost"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  size="sm"
                />
              ) : !open ? (
                <Kbd>⌘K</Kbd>
              ) : null}
            </Stack>
          </Container>
        </GlassSurface>

        {open && (
          <Container position="absolute" style={{ top: "calc(100% + 10px)" }} width="100%">
            <MenuSurface scroll data-testid={ChatSearchTestId.Panel}>
              {results.length === 0 ? (
                <Container padding="150">
                  <Typography type="note" variant="tertiary">
                    {t("empty")}
                  </Typography>
                </Container>
              ) : (
                <Stack gap="0">
                  {results.map((item, index) => {
                    const active = index === activeRow;
                    return (
                      <Card
                        aria-selected={active}
                        as="button"
                        background={active ? "raised" : "surface"}
                        bordered={false}
                        data-testid={`${ChatSearchTestId.Item}-${item.kind}-${item.id}`}
                        key={`${item.kind}-${item.id}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pick(item);
                        }}
                        onPointerMove={() => setActiveIndex(index)}
                        radius="none"
                        role="option"
                      >
                        <CardContent padding="75">
                          <Stack align="center" direction="row" gap="75" justify="between">
                            <Stack grow align="center" direction="row" gap="75">
                              <IconTile glyph={item.glyph} shape="circle" size="sm" />
                              <Container grow minW0>
                                <Typography truncate size="sm" type="text">
                                  {item.title}
                                </Typography>
                                {item.subtitle && (
                                  <Typography truncate size="xs" type="note" variant="tertiary">
                                    {item.subtitle}
                                  </Typography>
                                )}
                              </Container>
                            </Stack>
                            <Tag tone="neutral">{t(`kind.${item.kind}`)}</Tag>
                          </Stack>
                        </CardContent>
                      </Card>
                    );
                  })}
                </Stack>
              )}
            </MenuSurface>
          </Container>
        )}
      </Container>
    </>
  );
}
