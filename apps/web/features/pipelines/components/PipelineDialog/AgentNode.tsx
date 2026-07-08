"use client";
import type { MouseEvent } from "react";
import { useTranslations } from "next-intl";
import type { Agent } from "@zibby/contracts";
import type { IconName } from "@zibby/design-system";
import { Container, Icon, IconTile, Pressable, Stack, Tag, Typography } from "@zibby/design-system";
import { ModelBadge, ThinkBadge } from "../../../../components/RuntimeBadges/RuntimeBadges";
import { ACCENT, BAD, SURFACE, SURFACE_HI, mix } from "./canvas-tokens";
import { type GraphNode, NODE_H, NODE_W } from "./pipeline-graph";

export type PortKind = "in" | "out" | "top";

export interface PendingEdge {
  kind: "flow" | "rework";
  from: string;
  cursor: { x: number; y: number };
}
export interface HoverTarget {
  type: "in" | "node";
  node: string;
}

export interface AgentNodeProps {
  node: GraphNode;
  agents: Agent[];
  pending: PendingEdge | null;
  hover: HoverTarget | null;
  dragging: boolean;
  /** Whether the node already feeds a successor (hides the terminal output chip). */
  hasOutgoing: boolean;
  /** Detail view: render the node as a static card (no ports, drag, edit affordances). */
  readOnly?: boolean;
  /** Live-run attempt count for a loop node, shown as a tag in the read-only detail view. */
  attempt?: number;
  /** Max attempts (maxRetries + 1) for the "n/m" attempt tag. */
  maxAttempts?: number;
  /**
   * Read-only detail view only: clicking the node opens the pipeline's existing
   * config surface (Phase 85 Roster tab). Ignored in the editor (drag takes over
   * `onNodeDown` there).
   */
  onNodeClick?: (nodeId: string) => void;
  onPortDown: (which: PortKind, nodeId: string, e: MouseEvent) => void;
  onNodeDown: (nodeId: string, e: MouseEvent) => void;
  onDelete: (nodeId: string) => void;
  onCycleModel: (nodeId: string) => void;
  onCycleThink: (nodeId: string) => void;
  onSetProduces: (nodeId: string, value: string) => void;
  onPortEnter: (nodeId: string) => void;
  onPortLeave: (nodeId: string) => void;
  onNodeEnter: (nodeId: string) => void;
  onNodeLeave: (nodeId: string) => void;
}

const glyphOf = (node: GraphNode, agents: Agent[]): IconName =>
  node.type === "verify"
    ? "shield"
    : ((agents.find((a) => a.id === node.agent)?.glyph as IconName | undefined) ?? "bot");

const avatarOf = (node: GraphNode, agents: Agent[]): string | undefined =>
  node.type === "verify" ? undefined : agents.find((a) => a.id === node.agent)?.avatar;

const stop = (e: MouseEvent) => e.stopPropagation();

/**
 * A simplified agent card placed on the canvas. Three ports wire the graph:
 * left = input (drop target), right = output (drag a flow edge), top = rework
 * (drag a back-edge to an earlier node). Model/thinking badges cycle on click.
 */
export function AgentNode({
  node,
  agents,
  pending,
  hover,
  dragging,
  hasOutgoing,
  readOnly = false,
  attempt,
  maxAttempts,
  onNodeClick,
  onPortDown,
  onNodeDown,
  onDelete,
  onCycleModel,
  onCycleThink,
  onSetProduces,
  onPortEnter,
  onPortLeave,
  onNodeEnter,
  onNodeLeave,
}: AgentNodeProps) {
  const t = useTranslations("forms.pipeline");
  const label = node.type === "verify" ? t("typeVerify") : node.agent;
  const clickable = readOnly && Boolean(onNodeClick);

  const flowTarget = pending?.kind === "flow" && pending.from !== node.id;
  const reworkTarget = pending?.kind === "rework" && pending.from !== node.id;
  const inLit = flowTarget && hover?.type === "in" && hover.node === node.id;
  const nodeLit = reworkTarget && hover?.type === "node" && hover.node === node.id;

  const borderColor = nodeLit ? BAD : reworkTarget ? mix(BAD, 33) : mix(ACCENT, 33);

  const port = (which: PortKind) => {
    // Ports are wiring affordances — a static detail card has none.
    if (readOnly) return null;
    const isTop = which === "top";
    const isIn = which === "in";
    const c = isTop ? BAD : ACCENT;
    const lit = isIn && inLit;
    const pos =
      which === "in"
        ? { left: "-7px", top: `${NODE_H / 2 - 7}px` }
        : which === "out"
          ? { left: `${NODE_W - 7}px`, top: `${NODE_H / 2 - 7}px` }
          : { left: `${NODE_W / 2 - 7}px`, top: "-7px" };
    return (
      <Container
        aria-label={t(which === "in" ? "portIn" : which === "out" ? "portOut" : "portRework")}
        data-testid={`node-port-${which}`}
        height="14px"
        onMouseDown={isIn ? undefined : (e) => onPortDown(which, node.id, e)}
        onMouseEnter={isIn ? () => onPortEnter(node.id) : undefined}
        onMouseLeave={isIn ? () => onPortLeave(node.id) : undefined}
        position="absolute"
        role={isIn ? undefined : "button"}
        width="14px"
        {...pos}
        cursor={isIn ? "default" : "crosshair"}
        style={{
          borderRadius: 6,
          background: lit ? c : isIn ? SURFACE : mix(c, 16),
          border: `1.5px solid ${lit ? c : mix(c, 67)}`,
          boxShadow: lit ? `0 0 0 4px ${mix(c, 20)}` : "none",
          zIndex: 4,
        }}
      />
    );
  };

  return (
    <Container
      cursor={clickable ? "pointer" : readOnly ? "default" : dragging ? "grabbing" : "grab"}
      data-testid="pipeline-node"
      height={`${NODE_H}px`}
      left={`${node.x}px`}
      onClick={clickable ? () => onNodeClick?.(node.id) : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              onNodeClick?.(node.id);
            }
          : undefined
      }
      onMouseDown={readOnly ? undefined : (e) => onNodeDown(node.id, e)}
      onMouseEnter={readOnly ? undefined : () => onNodeEnter(node.id)}
      onMouseLeave={readOnly ? undefined : () => onNodeLeave(node.id)}
      padding={["100", "100"]}
      position="absolute"
      role={clickable ? "button" : undefined}
      style={{
        background: nodeLit ? SURFACE_HI : SURFACE,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        boxShadow: dragging
          ? `0 10px 28px rgba(0,0,0,0.5), 0 0 0 1px ${mix(ACCENT, 40)}`
          : nodeLit
            ? `0 0 0 1px ${mix(BAD, 40)}, 0 0 18px ${mix(BAD, 20)}`
            : "0 2px 10px rgba(0,0,0,0.3)",
      }}
      tabIndex={clickable ? 0 : undefined}
      top={`${node.y}px`}
      userSelect="none"
      width={`${NODE_W}px`}
    >
      {!readOnly && (
        <Pressable
          aria-label={t("removeNodeAria", { agent: label })}
          data-testid="node-delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(node.id);
          }}
          onMouseDown={stop}
          style={{ position: "absolute", top: -9, right: -9 }}
        >
          <IconTile glyph="x" shape="circle" size="sm" tone="neutral" />
        </Pressable>
      )}

      <Stack align="center" direction="row" gap="75">
        <IconTile
          alt={node.type === "verify" ? undefined : node.agent}
          glyph={glyphOf(node, agents)}
          size="sm"
          src={avatarOf(node, agents)}
        />
        <Container grow minW0>
          <Typography mono truncate size="xs" type="note" weight="bold">
            {label}
          </Typography>
        </Container>
        {readOnly && attempt !== undefined && (
          <Tag tone="warn">
            {maxAttempts !== undefined ? `${attempt}/${maxAttempts}` : `${attempt}`}
          </Tag>
        )}
      </Stack>

      {node.type === "agent" ? (
        <Stack direction="row" gap="50" style={{ marginTop: 6 }}>
          {readOnly ? (
            <>
              <ModelBadge model={node.model} />
              <ThinkBadge level={node.thinking} />
            </>
          ) : (
            <>
              <Pressable
                aria-label={t("cycleModelAria", { agent: node.agent })}
                onClick={(e) => {
                  e.stopPropagation();
                  onCycleModel(node.id);
                }}
                onMouseDown={stop}
              >
                <ModelBadge model={node.model} />
              </Pressable>
              <Pressable
                aria-label={t("cycleThinkAria", { agent: node.agent })}
                onClick={(e) => {
                  e.stopPropagation();
                  onCycleThink(node.id);
                }}
                onMouseDown={stop}
              >
                <ThinkBadge level={node.thinking} />
              </Pressable>
            </>
          )}
        </Stack>
      ) : (
        <Typography mono size="2xs" style={{ marginTop: 6 }} type="note" variant="tertiary">
          {node.commands.split("\n").filter((c) => c.trim()).length || t("checksDefault")}
        </Typography>
      )}

      {/* Terminal agent node: its output file has no arrow to carry it. */}
      {node.type === "agent" && !hasOutgoing && (
        <Stack align="center" direction="row" gap="25" style={{ marginTop: 6 }}>
          <Icon name="file" size="xs" tone="faint" />
          {readOnly ? (
            <Typography mono truncate size="2xs" tone="accent" type="note">
              {node.produces}
            </Typography>
          ) : (
            <input
              aria-label={t("outputFileAria", { agent: node.agent })}
              className="min-w-0 flex-1 border-none bg-transparent font-mono text-[10px] text-accent outline-none focus-visible:ring-2 focus-visible:ring-accent"
              onChange={(e) => onSetProduces(node.id, e.target.value)}
              onMouseDown={stop}
              spellCheck={false}
              value={node.produces}
            />
          )}
        </Stack>
      )}

      {port("in")}
      {port("out")}
      {port("top")}
    </Container>
  );
}
