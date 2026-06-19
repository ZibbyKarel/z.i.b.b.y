/**
 * Pure graph model for the pipeline node-graph editor, and its conversion to/from
 * the contract's flat `phases[]`. Kept dependency-free and side-effect-free so the
 * canvas component is a thin shell over it and the tricky logic (ordering,
 * consumes-threading, upstream-only rework, validation) is unit-testable.
 *
 * The graph is **one-out / one-in** per node (a teammate constraint), so it is
 * always linearizable: `graphToPhases` walks the flow edges into an ordered chain.
 * Node x/y positions are *not* persisted — `phasesToGraph` re-derives a
 * left-to-right layout when an existing pipeline is opened.
 */
import type { Agent, AgentModel, AgentThinking, CreatePipelineInput } from "@zibby/contracts";
import type { PhaseEscalation, PhaseLoop, Pipeline } from "../../../../domain";
import { slug } from "../../../../utils/slug";

export type ContractPhase = CreatePipelineInput["phases"][number];

// ---- geometry (shared with the canvas component) --------------------------
export const NODE_W = 188;
export const NODE_H = 64;
export const GAP_X = 84;
export const CANVAS_W = 1680;
export const CANVAS_H = 940;
/** Where `phasesToGraph` lays the first node, and the per-node step. */
const LAYOUT_X0 = 56;
const LAYOUT_Y0 = 200;

/**
 * The file the first agent picks up as its assignment — ZIBBY-internal
 * convention, never surfaced in the UI. The first phase always `consumes` this;
 * an edited pipeline keeps whatever its first phase already consumed.
 */
export const INITIAL_ASSIGNMENT = "task.md";

export interface GraphNode {
  /** Durable phase id — loop targets reference it; an edited pipeline keeps it. */
  id: string;
  type: "agent" | "verify";
  /** Agent id (empty for verify phases). */
  agent: string;
  /** Output file this node writes (= the `consumes` of its flow successor). */
  produces: string;
  /** Verify checks, one command per line ("" = project/default checks). */
  commands: string;
  model: AgentModel;
  thinking: AgentThinking;
  /**
   * A loop whose `to` can't be drawn as a rework edge (e.g. `loop.to: "fail"`, or
   * a target that isn't a node). Preserved verbatim so editing an existing
   * pipeline never silently drops it; the canvas just can't show it.
   */
  looseLoop?: PhaseLoop;
  x: number;
  y: number;
}

/** I/O hand-off: source output → exactly one target input. */
export interface FlowEdge {
  id: string;
  from: string;
  to: string;
}

/**
 * Rework (back-edge): on failure, return work to an **earlier** node. The canvas
 * only edits `maxRetries` + `escalate` (the teammate spec); `then` and the
 * `escalation` ladder are preserved across an edit round-trip but not exposed.
 */
export interface ReworkEdge {
  id: string;
  from: string;
  to: string;
  maxRetries: number;
  escalate: boolean;
  then: string;
  escalation: PhaseEscalation[];
}

export interface PipelineGraph {
  nodes: GraphNode[];
  flow: FlowEdge[];
  rework: ReworkEdge[];
}

// ---- ids ------------------------------------------------------------------
let _gid = 0;
/** Session-unique id for a freshly-created node/edge (stable within an edit). */
export const guid = (prefix: string): string => `${prefix}-${++_gid}`;

// ---- layout / construction ------------------------------------------------
/** Default output filename for a new node (agent slug, falling back to index). */
export const defaultProduces = (agentId: string, index: number): string =>
  `${slug(agentId, `handoff-${index}`)}.md`;

/** A fresh node for an agent dropped/clicked from the palette. */
export function makeNode(agent: Agent, index: number, x: number, y: number): GraphNode {
  return {
    id: guid("n"),
    type: "agent",
    agent: agent.id,
    produces: defaultProduces(agent.id, index),
    commands: "",
    model: agent.model ?? "sonnet",
    thinking: agent.thinking ?? "medium",
    x: clamp(x, 8, CANVAS_W - NODE_W - 8),
    y: clamp(y, 8, CANVAS_H - NODE_H - 8),
  };
}

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// ---- phases → graph (auto-layout on open) ---------------------------------
/**
 * Build the editor graph from a pipeline's `phases[]`, laying nodes left-to-right.
 * Flow edges connect consecutive phases; a phase with a `loop` becomes a rework
 * edge to the phase whose id matches `loop.to`. Returns an empty graph for a new
 * pipeline (no `initial`).
 */
export function phasesToGraph(initial: Pipeline | undefined, agents: Agent[]): PipelineGraph {
  if (!initial || initial.phases.length === 0) {
    return { nodes: [], flow: [], rework: [] };
  }
  const nodes: GraphNode[] = initial.phases.map((ph, i) => ({
    id: ph.id ?? `phase-${i + 1}`,
    type: ph.type,
    agent: ph.agent ?? agents[0]?.id ?? "",
    produces: ph.produces ?? defaultProduces(ph.agent ?? "output", i + 1),
    commands: (ph.commands ?? []).join("\n"),
    model: ph.model ?? "sonnet",
    thinking: ph.thinking ?? "medium",
    x: LAYOUT_X0 + i * (NODE_W + GAP_X),
    y: LAYOUT_Y0,
  }));
  const flow: FlowEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    flow.push({ id: guid("e"), from: nodes[i]!.id, to: nodes[i + 1]!.id });
  }
  const rework: ReworkEdge[] = [];
  initial.phases.forEach((ph, i) => {
    if (!ph.loop) return;
    const target = nodes.find((n) => n.id === ph.loop!.to);
    if (target) {
      rework.push({
        id: guid("w"),
        from: nodes[i]!.id,
        to: target.id,
        maxRetries: ph.loop.maxRetries,
        escalate: ph.loop.escalate,
        then: ph.loop.then,
        escalation: ph.loop.escalation ?? [],
      });
    } else {
      // `loop.to: "fail"` (or an unknown target) can't be a rework edge — keep it
      // on the node so a round-trip preserves it instead of dropping it.
      nodes[i]!.looseLoop = ph.loop;
    }
  });
  return { nodes, flow, rework };
}

// ---- ordering -------------------------------------------------------------
/**
 * Linearize the flow graph: start from each chain head (a node with no incoming
 * flow edge, in array order), walk its single outgoing edge, then append any
 * still-unseen nodes (orphans / defensive cycle break) in array order.
 */
export function orderNodes(graph: PipelineGraph): GraphNode[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const outgoing = new Map(graph.flow.map((e) => [e.from, e.to]));
  const hasIncoming = new Set(graph.flow.map((e) => e.to));

  const order: GraphNode[] = [];
  const seen = new Set<string>();
  const walk = (start: GraphNode) => {
    let cur: GraphNode | undefined = start;
    while (cur && !seen.has(cur.id)) {
      order.push(cur);
      seen.add(cur.id);
      const nextId = outgoing.get(cur.id);
      cur = nextId ? byId.get(nextId) : undefined;
    }
  };
  for (const n of graph.nodes) if (!hasIncoming.has(n.id)) walk(n);
  for (const n of graph.nodes) if (!seen.has(n.id)) walk(n);
  return order;
}

// ---- graph → phases (submit) ----------------------------------------------
/**
 * Project the graph to the contract phase array, threading `consumes` from each
 * node's incoming flow source (or the assignment file for a chain head). Mirrors
 * the proven id-based projection the linear dialog used.
 */
export function graphToPhases(graph: PipelineGraph, assignment: string): ContractPhase[] {
  const order = orderNodes(graph);
  const hasIncoming = new Set(graph.flow.map((e) => e.to));
  const reworkFrom = new Map(graph.rework.map((r) => [r.from, r]));
  const assign = assignment.trim() || INITIAL_ASSIGNMENT;

  const loopOf = (node: GraphNode): PhaseLoop | undefined => {
    const r = reworkFrom.get(node.id);
    if (r) {
      return {
        to: r.to,
        maxRetries: r.maxRetries,
        escalate: r.escalate,
        then: r.then,
        ...(r.escalation.length > 0 ? { escalation: r.escalation } : {}),
      };
    }
    return node.looseLoop;
  };

  // Thread the hand-off file along the chain. A verify phase passes the current
  // hand-off through untouched (it produces no artifact), so the agent after a
  // verify still consumes the previous agent's output — matching the old dialog.
  let handoff = assign;
  return order.map((node) => {
    // A chain head (no incoming flow) restarts from the assignment file.
    if (!hasIncoming.has(node.id)) handoff = assign;
    const loop = loopOf(node);

    if (node.type === "verify") {
      const commands = node.commands
        .split("\n")
        .map((c) => c.trim())
        .filter(Boolean);
      return {
        id: node.id,
        type: "verify" as const,
        ...(commands.length > 0 ? { commands } : {}),
        ...(loop ? { loop } : {}),
      };
    }

    const consumes = handoff;
    const produces = node.produces.trim();
    handoff = produces || handoff;
    return {
      id: node.id,
      type: "agent" as const,
      agent: node.agent,
      consumes,
      produces,
      model: node.model,
      thinking: node.thinking,
      ...(loop ? { loop } : {}),
    };
  });
}

// ---- validation (mirrors the contract superRefine) ------------------------
export interface GraphValidity {
  ok: boolean;
  /** i18n key under `forms.pipeline.invalid.*` describing the first problem. */
  reason?: "name" | "empty" | "agent" | "produces" | "rework";
}

/**
 * Whether the graph + name can be submitted. Mirrors the contract's
 * `refinePipeline`: a name, ≥1 node, agent nodes need agent + produces, and every
 * rework edge must point **upstream** in the flow chain to an existing node.
 */
export function validateGraph(graph: PipelineGraph, name: string): GraphValidity {
  if (name.trim().length === 0) return { ok: false, reason: "name" };
  if (graph.nodes.length === 0) return { ok: false, reason: "empty" };

  for (const n of graph.nodes) {
    if (n.type === "agent") {
      if (!n.agent) return { ok: false, reason: "agent" };
      if (n.produces.trim().length === 0) return { ok: false, reason: "produces" };
    }
  }

  const order = orderNodes(graph);
  const indexOf = new Map(order.map((n, i) => [n.id, i]));
  for (const r of graph.rework) {
    const fromIdx = indexOf.get(r.from);
    const toIdx = indexOf.get(r.to);
    // The target must exist and sit strictly earlier in the flow order — a
    // forward/self loop is nonsensical (the prototype let it through).
    if (fromIdx === undefined || toIdx === undefined || toIdx >= fromIdx) {
      return { ok: false, reason: "rework" };
    }
  }
  return { ok: true };
}

/** True when wiring a rework edge `from → to` would point upstream (legal). */
export function isUpstreamRework(graph: PipelineGraph, from: string, to: string): boolean {
  if (from === to) return false;
  const order = orderNodes(graph);
  const indexOf = new Map(order.map((n, i) => [n.id, i]));
  const f = indexOf.get(from);
  const t = indexOf.get(to);
  return f !== undefined && t !== undefined && t < f;
}
