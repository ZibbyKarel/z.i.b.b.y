import { z } from "zod";
import { IntegrationSchema } from "../integrations/integration.schema";
import { ProjectBudgetSchema, ProjectPersonSchema } from "./project.schema";

/**
 * The wire shape of a project's EFFECTIVE (company-merged) context — mirrors
 * `ResolvedProjectContext` from `apps/api/src/projects/resolved-project.helpers.ts`
 * (Phase 70's pure merge result: `people` / `budget` / `integrations`), plus
 * `companyId`/`companyName` (Phase 72 addition) so the web project detail can show
 * a "from company X" note. `companyId`/`companyName` are only ever both present or
 * both absent — present when `project.companyId` resolves to a real company,
 * absent for a company-less project OR a dangling `companyId` (its company was
 * deleted): in both cases every facet below already equals the project's own raw
 * data (Phase 68/70's "dangling companyId = no company" decision), so the absence
 * of a company name is never a lie about where the data came from.
 *
 * Served by `GET /projects/:id/resolved` (Phase 72).
 */
export const ResolvedProjectContextSchema = z.object({
  people: z.array(ProjectPersonSchema),
  budget: ProjectBudgetSchema.optional(),
  integrations: z.array(IntegrationSchema),
  companyId: z.string().optional(),
  companyName: z.string().optional(),
});
export type ResolvedProjectContext = z.infer<typeof ResolvedProjectContextSchema>;
