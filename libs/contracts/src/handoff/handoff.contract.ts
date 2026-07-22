import { initContract } from "@ts-rest/core";
import { HandoffRuleSchema } from "./handoff.schema";

const c = initContract();

/**
 * Cross-subsystem handoff rules (design doc
 * `docs/superpowers/specs/2026-07-22-subsystem-handoff-design.md`, Part A). v1 is
 * read-only: the rule set is seeded + file-backed (`HandoffRuleStore`, A2); CRUD
 * endpoints are deferred to the Part-2 rule-editor UI spec.
 */
export const handoffContract = c.router(
  {
    getHandoffRules: {
      method: "GET",
      path: "/handoff-rules",
      responses: {
        200: HandoffRuleSchema.array(),
      },
      summary: "List all standing handoff rules (seeded system rules + operator-authored ones)",
    },
  },
  {
    pathPrefix: "/api",
    strictStatusCodes: true,
  },
);

export type HandoffContract = typeof handoffContract;
