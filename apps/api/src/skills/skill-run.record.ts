import { SkillIdSchema, type SkillRun, SkillRunSchema } from "@zibby/contracts"
import { z } from "zod"
import type { BaseRun, KindStrategy, RunSpec } from "../runner/runner-core.types"

/**
 * On-disk / in-memory record for a skill run. A strict superset of the contract's
 * {@link SkillRun}: adds the runner discriminator (`kind`) and Phase 6 `pgid`,
 * neither exposed over HTTP. {@link toSkillRun} projects it back to the contract.
 */
export const SkillRunRecordSchema = SkillRunSchema.extend({
  kind: z.literal("skill").default("skill"),
  pgid: z.number().int().optional(),
})

export type SkillRunRecord = z.infer<typeof SkillRunRecordSchema> & BaseRun

/** Project a runner record down to the contract `SkillRun` (drops `kind`/`pgid`). */
export function toSkillRun(rec: SkillRunRecord): SkillRun {
  return SkillRunSchema.parse(rec)
}

/** The strategy that teaches {@link RunnerCore} how to handle the `skill` kind. */
export const skillStrategy: KindStrategy<SkillRunRecord> = {
  schema: SkillRunRecordSchema,
  assemble(base: BaseRun, spec: RunSpec): SkillRunRecord {
    return {
      ...base,
      kind: "skill",
      skillId: SkillIdSchema.parse(spec.extra.skillId),
      prompt: String(spec.extra.prompt ?? ""),
      project: String(spec.extra.project ?? ""),
    }
  },
}
