import { initContract } from "@ts-rest/core"
import { BudgetStatusSchema, GlobalBudgetSchema } from "./budget.schema"

const c = initContract()

/**
 * Budget (Phase 8.1): a READ of the per-engagement spend position plus the
 * operator-owned global ceiling. `GET /api/budget` is a pure read assembled from
 * the dispatch ledger, the runner registries and the task store; the config routes
 * own `data/budget.json` (the global pause thresholds). There is deliberately no
 * write path for the per-project caps here — those live on the project record
 * (`PATCH /projects/:id`), the single source of truth for an engagement.
 */
export const budgetContract = c.router(
  {
    getBudget: {
      method: "GET",
      path: "/budget",
      responses: { 200: BudgetStatusSchema },
      summary: "Per-engagement budget status + global account ceiling",
    },
    getBudgetConfig: {
      method: "GET",
      path: "/budget/config",
      responses: { 200: GlobalBudgetSchema },
      summary: "Read the operator-owned global pause thresholds",
    },
    updateBudgetConfig: {
      method: "PUT",
      path: "/budget/config",
      body: GlobalBudgetSchema,
      responses: { 200: GlobalBudgetSchema },
      summary: "Replace the global pause thresholds (data/budget.json)",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
)
export type BudgetContract = typeof budgetContract
