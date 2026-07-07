import { z } from "zod";
import { AgentIdSchema } from "../agents/agent.schema";
import { ProjectBudgetSchema, ProjectPersonSchema } from "../projects/project.schema";

/**
 * A company's `id` doubles as the registry key and travels in a URL path param
 * (`DELETE /companies/:id`), so it reuses the same filename-safe id rules as
 * projects and agents — no path separators or traversal.
 */
export const CompanyIdSchema = AgentIdSchema;

/**
 * A company (firma) — a super-entity above Project (Phase 68 / TODO item 12).
 * Holds a canonical roster (`people`) and a default `budget`; a linked project's
 * effective people/budget are computed at read time by MERGING the company's
 * data with the project's own (field-level for budget, by-`id` override/augment
 * for people) — the company record is never copied into the project. That merge
 * (and the resolved-project service that computes it) lands in Phase 70; this
 * schema only carries the company's own data.
 */
export const CompanySchema = z.object({
  id: CompanyIdSchema,
  name: z.string().min(1),
  desc: z.string().optional(),
  /** Canonical roster: team, clients, stakeholders shared by every linked project. */
  people: z.array(ProjectPersonSchema).optional(),
  /** Default per-engagement budget; a linked project overrides it field-by-field. */
  budget: ProjectBudgetSchema.optional(),
});
export type Company = z.infer<typeof CompanySchema>;

/** Body accepted by `createCompany` — the full entity (`id` + `name` required). */
export const CreateCompanySchema = CompanySchema;
export type CreateCompanyInput = z.infer<typeof CreateCompanySchema>;

/** Body accepted by `updateCompany` — every field optional (partial update), id excluded. */
export const UpdateCompanySchema = CompanySchema.omit({ id: true }).partial();
export type UpdateCompanyInput = z.infer<typeof UpdateCompanySchema>;
