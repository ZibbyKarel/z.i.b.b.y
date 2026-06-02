import type { IconName } from "@zibby/design-system";

export interface Skill {
  id: string;
  name: string;
  glyph: IconName;
  desc: string;
  /** Path to the backing SKILL.md on disk. */
  file: string;
}

export interface RunningAgent {
  id: string;
  skill: string;
  prompt: string;
  state: "running" | "done" | "error";
  pct: number;
  started: string;
  project: string;
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

export interface QuotaLimit {
  label: string;
  short: string;
  usedPct: number;
  resetIn: string;
  tokens: string;
}

export interface ClaudeLimits {
  rolling: QuotaLimit;
  weekly: QuotaLimit;
}

export interface AgentSdkCredit {
  label: string;
  total: number;
  used: number;
  remaining: number;
  usedPct: number;
  renew: string;
  byAgent: Array<[name: string, dollars: number]>;
  byPipeline: Array<[name: string, dollars: number]>;
  trend: number[];
}

export type ModelName = "opus" | "sonnet" | "haiku";
export type ThinkingLevel = "high" | "medium" | "low";

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
  model: ModelName;
  thinking: ThinkingLevel;
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

export interface AgentDef {
  id: string;
  name: string;
  glyph: IconName;
  role: string;
  model: ModelName;
  thinking: ThinkingLevel;
  tools: string[];
  state: string;
  file: string;
  /** Functional category id (within a context) used to group the catalog. */
  category?: string;
  /** Paused agents stay defined but are skipped by pipelines. Defaults to enabled. */
  enabled?: boolean;
  /** How many times the agent has been launched. */
  runs?: number;
  /** Raw `*.agent.md` body — the editable source of truth. */
  body?: string;
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
export function glyphForAgent(name: string, agents: AgentDef[]): IconName {
  return agents.find((a) => a.name === name)?.glyph ?? "bot";
}
