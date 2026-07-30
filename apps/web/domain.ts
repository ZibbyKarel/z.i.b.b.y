import type {
  Agent,
  AgentModel,
  AgentThinking,
  PipelineComplexity,
  SubsystemId,
} from "@zibby/contracts";
import type { IconName } from "@zibby/design-system";
import type { MessageKey } from "./i18n/keys";

/**
 * Functional category used to group the agent catalog. Categories are now a
 * dynamic, user-managed taxonomy (`GET /api/agents/categories`), so this is a
 * free-form string — the name is shown verbatim (no translation). `state/config.ts`
 * (`AGENT_CATEGORIES` / `AGENT_CATEGORY_GLYPH`) only provides seed defaults and a
 * glyph fallback for the picker.
 */
export type AgentCategory = string;

export interface Skill {
  id: string;
  name: string;
  glyph: IconName;
  desc: string;
  /** Functional category grouping the skill catalog (`GET /api/skills/categories`). */
  category?: string;
  /** Path to the backing SKILL.md on disk. */
  file: string;
  /** Ids of linked global gate rules (the "Pravidla schvalování" catalog). */
  gateRuleIds?: string[];
}

export interface Approval {
  id: string;
  skill: string;
  action: string;
  detail: string;
  /** Short risk tag, e.g. "platba". */
  risk: string;
}

export interface AgentSdkCredit {
  label: MessageKey;
  total: number;
  used: number;
  remaining: number;
  usedPct: number;
  renew: MessageKey;
  byAgent: Array<[name: string, dollars: number]>;
  byPipeline: Array<[name: string, dollars: number]>;
  trend: number[];
}

export interface PhaseEscalation {
  model?: AgentModel;
  thinking?: AgentThinking;
}

export interface PhaseLoop {
  to: string;
  maxRetries: number;
  escalate: boolean;
  then: string;
  /** Per-retry model/thinking ladder (rung n → retry n; clamps to the last rung). */
  escalation?: PhaseEscalation[];
}

export interface PipelinePhase {
  /** Phase id from the definition (loop targets reference it); editing needs it. */
  id?: string;
  /** What the phase executes: an agent session, or deterministic verify checks. */
  type: "agent" | "verify";
  agent?: string;
  consumes?: string;
  produces?: string;
  model?: AgentModel;
  thinking?: AgentThinking;
  /** Verify phases only: shell commands run with `&&` (override project checks). */
  commands?: string[];
  loop?: PhaseLoop;
}

export type PipelineState = "done" | "parked" | "failed" | "running";

/**
 * A pipeline's terminal delivery sink (the config that replaced the `pr-autor`
 * agent): open a PR, or write a produced artifact into the project or the vault.
 */
export type PipelineOutput =
  | { type: "pr"; from: string }
  | { type: "file"; from: string; dest: "project" | "vault"; to: string };

export interface Pipeline {
  id: string;
  name: string;
  lastRun: string;
  lastState: PipelineState;
  desc: string;
  file: string;
  phases: PipelinePhase[];
  /** Delivery sinks run after the chain finishes green (empty = chain ends silently). */
  outputs: PipelineOutput[];
  /** Optional avatar image (data URI or `/avatars/*.png` path) shown in place of the glyph. */
  avatar?: string;
  /**
   * Optional attribution to a subsystem of the federation (Phase 81 contract field) —
   * which of the eight subsystems "owns" this pipeline for its Roster tab (Phase 85).
   * Absent is a legitimate state: not every pipeline has an owner yet.
   */
  ownerSubsystem?: SubsystemId;
  /**
   * NS2 F9 — the pipeline's rung on its owning subsystem's complexity ladder.
   * Carried (not rendered) so a client-side duplicate preserves the rung instead
   * of silently resetting it to the contract's `"standard"` default; the rung is
   * authored in the `.pipeline.md`, like `outputs`.
   *
   * Optional HERE while non-optional on the contract entity: the query mapper
   * always supplies it, so `undefined` only ever means "a locally constructed
   * pipeline that predates the ladder" (the mock store, a test fixture) — and
   * that must not be a compile error in a display-only model.
   */
  complexity?: PipelineComplexity;
}

export type IntegrationStatus = "connected" | "disconnected" | "error";

export interface Integration {
  id: string;
  name: string;
  glyph: IconName;
  desc: string;
  status: IntegrationStatus;
  /** Path to the backing config file on disk. */
  file: string;
}

export interface BriefingItem {
  tone: "ok" | "warn" | "bad";
  icon: IconName;
  title: string;
  sub: string;
}

export interface SystemStatus {
  host: string;
  awake: boolean;
  pipelines: number;
  skills: number;
}

/** Glyph for an agent name, falling back to a generic bot. */
export function glyphForAgent(name: string | undefined, agents: Agent[]): IconName {
  return (agents.find((a) => a.name === name)?.glyph as IconName | undefined) ?? "bot";
}

/** Glyph for a pipeline phase: verify phases get the shield, agents their glyph. */
export function glyphForPhase(phase: PipelinePhase, agents: Agent[]): IconName {
  return phase.type === "verify" ? "shield" : glyphForAgent(phase.agent, agents);
}
