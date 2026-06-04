import { z } from "zod"
import { AgentRunStatusSchema } from "../agent-runs/agent-run.schema"
import { SkillIdSchema } from "./skill.schema"

/**
 * A single execution of a skill. Same lifecycle and durability as an agent run
 * (it reuses the shared `RunnerCore`), differing only in carrying a `skillId`
 * instead of an `agentId`. `runId` doubles as the log file's base name.
 */
export const SkillRunSchema = z.object({
  runId: z.string().min(1),
  skillId: SkillIdSchema,
  status: AgentRunStatusSchema,
  pct: z.number().min(0).max(100),
  prompt: z.string(),
  project: z.string(),
  cwd: z.string(),
  startedAt: z.string().datetime(),
  pid: z.number().int(),
  logFile: z.string(),
})
export type SkillRun = z.infer<typeof SkillRunSchema>

/** Body accepted by `startSkillRun`. */
export const StartSkillRunSchema = z.object({
  prompt: z.string(),
  project: z.string().optional(),
})
export type StartSkillRunInput = z.infer<typeof StartSkillRunSchema>
