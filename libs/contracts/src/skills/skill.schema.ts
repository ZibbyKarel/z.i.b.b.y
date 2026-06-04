import { z } from "zod"
import { AgentIdSchema } from "../agents/agent.schema"
import { RiskSchema } from "../common.schema"

/**
 * A skill is the same on-disk shape as an agent — a `SKILL.md` file with YAML
 * frontmatter plus a Markdown body — close to the user-skills under
 * `/mnt/skills/user`. The id doubles as the file name, so it reuses the agent id
 * rules (filename-safe, no traversal). Unifies with the dashboard's `Skill`
 * (`id, name, glyph, desc`); `instructions` is the Markdown body. `desc`/`glyph`
 * stay free-form for the same reason agents' do — the closed set lives in the app.
 */
export const SkillIdSchema = AgentIdSchema

export const SkillSchema = z.object({
  id: SkillIdSchema,
  name: z.string().min(1).optional(),
  glyph: z.string().optional(),
  desc: z.string().optional(),
  /** Phase 3 approval gate (see {@link AgentSchema}); `risk` is a display hint. */
  requires_approval: z.boolean().optional(),
  risk: RiskSchema.optional(),
  instructions: z.string().min(1),
})
export type Skill = z.infer<typeof SkillSchema>

/** Body accepted by `createSkill` — full entity (`id` + `instructions` required). */
export const CreateSkillSchema = SkillSchema
export type CreateSkillInput = z.infer<typeof CreateSkillSchema>

/** Body accepted by `updateSkill` — every field optional (partial), id excluded. */
export const UpdateSkillSchema = SkillSchema.omit({ id: true }).partial()
export type UpdateSkillInput = z.infer<typeof UpdateSkillSchema>
