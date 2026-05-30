/**
 * Shared velín domain types.
 *
 * These describe the files-as-source-of-truth model the dashboard renders
 * (skills, agents, pipelines, quotas). They live here — rather than beside a
 * single component — because both the presentational components and the web
 * app's data layer depend on them.
 */
import type { IconName } from "./components/Icon/Icon"

export type ContextName = "home" | "work"

export interface Skill {
  id: string
  name: string
  glyph: IconName
  desc: string
  ctx: ContextName
  /** Path to the backing SKILL.md on disk. */
  file: string
}

export interface RunningAgent {
  id: string
  skill: string
  ctx: ContextName
  prompt: string
  state: "running" | "done" | "error"
  pct: number
  started: string
  project: string
}

export interface Approval {
  id: string
  skill: string
  ctx: ContextName
  action: string
  detail: string
  /** Short risk tag, e.g. "platba". */
  risk: string
}

export type ActivityIcon = "run" | "wait" | "ok" | "edit"

export interface ActivityEvent {
  id: string
  t: string
  icon: ActivityIcon
  ctx: ContextName
  text: string
  sub: string
}

export interface QuotaLimit {
  label: string
  short: string
  usedPct: number
  resetIn: string
  tokens: string
}

export interface ClaudeLimits {
  rolling: QuotaLimit
  weekly: QuotaLimit
}

export interface AgentSdkCredit {
  label: string
  total: number
  used: number
  remaining: number
  usedPct: number
  renew: string
  byAgent: Array<[name: string, ctx: ContextName, dollars: number]>
  byPipeline: Array<[name: string, ctx: ContextName, dollars: number]>
  byContext: Array<[ctx: ContextName, dollars: number]>
  trend: number[]
}

export type ModelName = "opus" | "sonnet" | "haiku"
export type ThinkingLevel = "high" | "medium" | "low"

export interface PhaseLoop {
  to: string
  maxRetries: number
  escalate: boolean
  then: string
}

export interface PipelinePhase {
  agent: string
  consumes: string
  produces: string
  model: ModelName
  thinking: ThinkingLevel
  loop?: PhaseLoop
}

export type PipelineState = "done" | "parked" | "failed" | "running"

export interface Pipeline {
  id: string
  name: string
  ctx: ContextName
  budget: number
  lastRun: string
  lastState: PipelineState
  desc: string
  file: string
  phases: PipelinePhase[]
}

export interface AgentDef {
  id: string
  name: string
  glyph: IconName
  role: string
  model: ModelName
  thinking: ThinkingLevel
  tools: string[]
  ctx: ContextName
  state: string
  file: string
}

export interface NavItem {
  id: string
  label: string
  glyph: IconName
  badge?: number
}

export interface BriefingItem {
  tone: "ok" | "warn" | "bad"
  icon: IconName
  title: string
  sub: string
}

export interface SystemStatus {
  host: string
  awake: boolean
  pipelines: number
  skills: number
}

/** Glyph for an agent name, falling back to a generic bot. */
export function glyphForAgent(name: string, agents: AgentDef[]): IconName {
  return agents.find((a) => a.name === name)?.glyph ?? "bot"
}
