import type { Agent, AgentModel, AgentThinking } from "@zibby/contracts";
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

export type ActivityIcon = "run" | "wait" | "ok" | "edit";

export interface ActivityEvent {
  id: string;
  t: string;
  icon: ActivityIcon;
  text: string;
  sub: string;
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

export interface PhaseLoop {
  to: string;
  maxRetries: number;
  escalate: boolean;
  then: string;
}

export interface PipelinePhase {
  agent: string;
  consumes: string;
  produces: string;
  model: AgentModel;
  thinking: AgentThinking;
  loop?: PhaseLoop;
}

export type PipelineState = "done" | "parked" | "failed" | "running";

export interface Pipeline {
  id: string;
  name: string;
  budget: number;
  lastRun: string;
  lastState: PipelineState;
  desc: string;
  file: string;
  phases: PipelinePhase[];
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
export function glyphForAgent(name: string, agents: Agent[]): IconName {
  return (
    (agents.find((a) => a.name === name)?.glyph as IconName | undefined) ??
    "bot"
  );
}
