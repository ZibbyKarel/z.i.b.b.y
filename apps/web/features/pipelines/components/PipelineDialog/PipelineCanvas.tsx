"use client";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Agent, AgentModel, AgentThinking } from "@zibby/contracts";
import { Container, Icon, Stack, Typography } from "@zibby/design-system";
import { ACCENT, BAD } from "./canvas-tokens";
import { AgentNode, type HoverTarget, type PendingEdge, type PortKind } from "./AgentNode";
import { FlowFileControl, ReworkControl } from "./EdgeControls";
import {
  CANVAS_H,
  CANVAS_W,
  type GraphNode,
  NODE_H,
  NODE_W,
  type PipelineGraph,
  clamp,
  guid,
  isUpstreamRework,
} from "./pipeline-graph";
import { AGENT_DND_TYPE } from "./AgentPalette";

const CYCLE_MODEL: AgentModel[] = ["opus", "sonnet", "haiku"];
const CYCLE_THINK: AgentThinking[] = ["high", "medium", "low"];
const cycle = <T,>(arr: T[], v: T): T => arr[(arr.indexOf(v) + 1) % arr.length]!;

type Pt = { x: number; y: number };
const portPt = (n: GraphNode | undefined, which: PortKind): Pt => {
  if (!n) return { x: 0, y: 0 };
  if (which === "in") return { x: n.x, y: n.y + NODE_H / 2 };
  if (which === "out") return { x: n.x + NODE_W, y: n.y + NODE_H / 2 };
  return { x: n.x + NODE_W / 2, y: n.y };
};
const flowPath = (a: Pt, b: Pt): string => {
  const dx = Math.max(46, Math.abs(b.x - a.x) / 2);
  return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
};
const reworkPath = (a: Pt, b: Pt): string => {
  const peak = Math.min(a.y, b.y) - 56;
  const mx = (a.x + b.x) / 2;
  return `M${a.x},${a.y} C${a.x},${peak} ${mx},${peak} ${mx},${peak} S${b.x},${peak} ${b.x},${b.y}`;
};

export interface PipelineCanvasProps {
  graph: PipelineGraph;
  setGraph: (update: (g: PipelineGraph) => PipelineGraph) => void;
  agents: Agent[];
  /** Add an agent node (palette drop with canvas coords). */
  onAddAgent: (agentId: string, x: number, y: number) => void;
}

/**
 * The node-graph canvas: drop agents from the palette, drag nodes, and wire edges
 * by dragging from the output port (flow) or top port (rework). All edge geometry
 * and the live drag preview are drawn in one SVG layer behind the node DOM.
 */
export function PipelineCanvas({ graph, setGraph, agents, onAddAgent }: PipelineCanvasProps) {
  const t = useTranslations("forms.pipeline");
  const [pending, setPending] = useState<PendingEdge | null>(null);
  const [nodeDrag, setNodeDrag] = useState<{ id: string } | null>(null);
  const [hover, setHoverState] = useState<HoverTarget | null>(null);

  const canvasRef = useRef<HTMLElement>(null);
  const hoverRef = useRef<HoverTarget | null>(null);
  const dragRef = useRef<{ id: string; offx: number; offy: number } | null>(null);
  const setHover = (v: HoverTarget | null) => {
    hoverRef.current = v;
    setHoverState(v);
  };

  const nodeById = (id: string) => graph.nodes.find((n) => n.id === id);
  const toCanvas = (cx: number, cy: number): Pt => {
    const r = canvasRef.current?.getBoundingClientRect();
    return r ? { x: cx - r.left, y: cy - r.top } : { x: cx, y: cy };
  };

  // ---- graph mutations ----------------------------------------------------
  const delNode = (id: string) =>
    setGraph((g) => ({
      nodes: g.nodes.filter((n) => n.id !== id),
      flow: g.flow.filter((e) => e.from !== id && e.to !== id),
      rework: g.rework.filter((r) => r.from !== id && r.to !== id),
    }));
  const cycleModel = (id: string) =>
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === id ? { ...n, model: cycle(CYCLE_MODEL, n.model) } : n)),
    }));
  const cycleThink = (id: string) =>
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) =>
        n.id === id ? { ...n, thinking: cycle(CYCLE_THINK, n.thinking) } : n,
      ),
    }));
  const setProduces = (id: string, produces: string) =>
    setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, produces } : n)) }));
  const delFlow = (id: string) =>
    setGraph((g) => ({ ...g, flow: g.flow.filter((e) => e.id !== id) }));
  const patchRework = (id: string, patch: Partial<{ maxRetries: number; escalate: boolean }>) =>
    setGraph((g) => ({
      ...g,
      rework: g.rework.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  const delRework = (id: string) =>
    setGraph((g) => ({ ...g, rework: g.rework.filter((r) => r.id !== id) }));

  const commit = (pend: PendingEdge, tgt: HoverTarget | null) => {
    if (!tgt) return;
    if (pend.kind === "flow" && tgt.type === "in" && tgt.node !== pend.from) {
      setGraph((g) => ({
        ...g,
        // One-out / one-in: drop any existing edge from the source or into the target.
        flow: [
          ...g.flow.filter((e) => e.from !== pend.from && e.to !== tgt.node),
          { id: guid("e"), from: pend.from, to: tgt.node },
        ],
      }));
    } else if (pend.kind === "rework" && tgt.type === "node" && tgt.node !== pend.from) {
      // Reject a forward/self loop — rework must point upstream in the flow.
      if (!isUpstreamRework(graph, pend.from, tgt.node)) return;
      setGraph((g) => ({
        ...g,
        rework: [
          ...g.rework.filter((r) => r.from !== pend.from),
          {
            id: guid("w"),
            from: pend.from,
            to: tgt.node,
            maxRetries: 3,
            escalate: true,
            then: "park",
            escalation: [],
          },
        ],
      }));
    }
  };

  // ---- port / node mouse handlers -----------------------------------------
  const onPortDown = (which: PortKind, nodeId: string, e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setPending({
      kind: which === "top" ? "rework" : "flow",
      from: nodeId,
      cursor: portPt(nodeById(nodeId), which),
    });
    setHover(null);
  };
  const onNodeDown = (nodeId: string, e: MouseEvent) => {
    if (e.button !== 0) return;
    const n = nodeById(nodeId);
    if (!n) return;
    const c = toCanvas(e.clientX, e.clientY);
    dragRef.current = { id: nodeId, offx: c.x - n.x, offy: c.y - n.y };
    setNodeDrag({ id: nodeId });
  };
  const onPortEnter = (nodeId: string) => {
    if (pending?.kind === "flow" && pending.from !== nodeId) setHover({ type: "in", node: nodeId });
  };
  const onPortLeave = (nodeId: string) => {
    if (hoverRef.current?.type === "in" && hoverRef.current.node === nodeId) setHover(null);
  };
  const onNodeEnter = (nodeId: string) => {
    if (pending?.kind === "rework" && pending.from !== nodeId)
      setHover({ type: "node", node: nodeId });
  };
  const onNodeLeave = (nodeId: string) => {
    if (hoverRef.current?.type === "node" && hoverRef.current.node === nodeId) setHover(null);
  };

  // ---- global drag tracking -----------------------------------------------
  useEffect(() => {
    if (!pending && !nodeDrag) return;
    const mm = (e: globalThis.MouseEvent) => {
      const c = toCanvas(e.clientX, e.clientY);
      if (pending) setPending((p) => (p ? { ...p, cursor: c } : p));
      const d = dragRef.current;
      if (nodeDrag && d) {
        setGraph((g) => ({
          ...g,
          nodes: g.nodes.map((n) =>
            n.id === d.id
              ? {
                  ...n,
                  x: clamp(c.x - d.offx, 8, CANVAS_W - NODE_W - 8),
                  y: clamp(c.y - d.offy, 8, CANVAS_H - NODE_H - 8),
                }
              : n,
          ),
        }));
      }
    };
    const mu = () => {
      if (pending) {
        commit(pending, hoverRef.current);
        setPending(null);
        setHover(null);
      }
      if (nodeDrag) {
        dragRef.current = null;
        setNodeDrag(null);
      }
    };
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    return () => {
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", mu);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, nodeDrag, graph]);

  const pendFrom = pending
    ? portPt(nodeById(pending.from), pending.kind === "rework" ? "top" : "out")
    : null;
  const hasOutgoing = (id: string) => graph.flow.some((e) => e.from === id);

  return (
    <Container
      grow
      height="100%"
      minHeight="0"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData(AGENT_DND_TYPE);
        if (!id) return;
        const c = toCanvas(e.clientX, e.clientY);
        onAddAgent(id, c.x - NODE_W / 2, c.y - NODE_H / 2);
      }}
      overflow="auto"
      position="relative"
      style={{ background: "var(--color-background)" }}
    >
      <Container
        cursor={pending ? "crosshair" : "default"}
        data-testid="pipeline-canvas"
        height={`${CANVAS_H}px`}
        position="relative"
        ref={canvasRef}
        style={{
          backgroundImage: `radial-gradient(var(--color-border) 1px, transparent 1px)`,
          backgroundSize: "22px 22px",
          backgroundPosition: "11px 11px",
        }}
        userSelect={pending || nodeDrag ? "none" : "auto"}
        width={`${CANVAS_W}px`}
      >
        <svg
          height={CANVAS_H}
          role="presentation"
          // eslint-disable-next-line react/forbid-dom-props
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 1,
            overflow: "visible",
          }}
          width={CANVAS_W}
        >
          {graph.flow.map((e) => {
            const from = nodeById(e.from);
            const to = nodeById(e.to);
            if (!from || !to) return null;
            const a = portPt(from, "out");
            const b = portPt(to, "in");
            return (
              <g key={e.id}>
                <path d={flowPath(a, b)} fill="none" stroke={ACCENT} strokeWidth="1.6" />
                <path
                  d={`M${b.x},${b.y} L${b.x - 8},${b.y - 4.5} L${b.x - 8},${b.y + 4.5} Z`}
                  fill={ACCENT}
                />
              </g>
            );
          })}
          {graph.rework.map((r) => {
            const from = nodeById(r.from);
            const to = nodeById(r.to);
            if (!from || !to) return null;
            const a = portPt(from, "top");
            const b = portPt(to, "top");
            return (
              <g key={r.id}>
                <path
                  d={reworkPath(a, b)}
                  fill="none"
                  stroke={BAD}
                  strokeDasharray="4 3"
                  strokeWidth="1.4"
                />
                <path
                  d={`M${b.x},${b.y} L${b.x - 4.5},${b.y - 8} L${b.x + 4.5},${b.y - 8} Z`}
                  fill={BAD}
                />
              </g>
            );
          })}
          {pending && pendFrom && (
            <path
              d={
                pending.kind === "rework"
                  ? reworkPath(pendFrom, pending.cursor)
                  : flowPath(pendFrom, pending.cursor)
              }
              fill="none"
              opacity="0.8"
              stroke={pending.kind === "rework" ? BAD : ACCENT}
              strokeDasharray="5 4"
              strokeWidth="1.6"
            />
          )}
        </svg>

        {graph.nodes.map((n) => (
          <AgentNode
            agents={agents}
            dragging={nodeDrag?.id === n.id}
            hasOutgoing={hasOutgoing(n.id)}
            hover={hover}
            key={n.id}
            node={n}
            onCycleModel={cycleModel}
            onCycleThink={cycleThink}
            onDelete={delNode}
            onNodeDown={onNodeDown}
            onNodeEnter={onNodeEnter}
            onNodeLeave={onNodeLeave}
            onPortDown={onPortDown}
            onPortEnter={onPortEnter}
            onPortLeave={onPortLeave}
            onSetProduces={setProduces}
            pending={pending}
          />
        ))}

        {graph.flow.map((e) => {
          const from = nodeById(e.from);
          const to = nodeById(e.to);
          if (!from || !to) return null;
          const a = portPt(from, "out");
          const b = portPt(to, "in");
          return (
            <FlowFileControl
              key={e.id}
              left={(a.x + b.x) / 2}
              onChange={(v) => setProduces(from.id, v)}
              onDelete={() => delFlow(e.id)}
              top={(a.y + b.y) / 2}
              value={from.produces}
            />
          );
        })}

        {graph.rework.map((r) => {
          const from = nodeById(r.from);
          const to = nodeById(r.to);
          if (!from || !to) return null;
          const a = portPt(from, "top");
          const b = portPt(to, "top");
          return (
            <ReworkControl
              escalate={r.escalate}
              key={r.id}
              left={(a.x + b.x) / 2}
              maxRetries={r.maxRetries}
              onDelete={() => delRework(r.id)}
              onEscalate={(on) => patchRework(r.id, { escalate: on })}
              onMaxRetries={(n) => patchRework(r.id, { maxRetries: n })}
              top={Math.min(a.y, b.y) - 56}
            />
          );
        })}

        {graph.nodes.length === 0 && (
          <Container
            bottom="0"
            left="0"
            position="absolute"
            right="0"
            style={{ display: "grid", placeItems: "center", pointerEvents: "none" }}
            top="0"
          >
            <Stack align="center" gap="100">
              <Icon name="flow" size="xl" tone="faint" />
              <Typography mono size="sm" type="note" variant="tertiary">
                {t("canvasEmpty")}
              </Typography>
              <Typography mono size="xs" type="note" variant="tertiary">
                {t("canvasEmptyHint")}
              </Typography>
            </Stack>
          </Container>
        )}
      </Container>
    </Container>
  );
}
