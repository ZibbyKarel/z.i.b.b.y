import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import { ReviewRuleSchema } from "./review-rule.schema";

const c = initContract();

/**
 * Learned review rules: read one scope's rules, and widen an active rule from its
 * project to every project. There is no create/delete route — rules are BORN from
 * the nightly pass and activated only by a `review-rule` approval, so a client can
 * never mint one.
 */
export const reviewLearningContract = c.router(
  {
    listReviewRules: {
      method: "GET",
      path: "/review-rules",
      query: z.object({ scope: z.string().min(1) }),
      responses: { 200: z.array(ReviewRuleSchema) },
      summary: "Rules in one scope (a project id, or `_global`)",
    },
    promoteReviewRule: {
      method: "POST",
      path: "/review-rules/:projectId/:ruleId/promote",
      body: z.object({}).optional(),
      responses: { 200: ReviewRuleSchema, 404: ErrorSchema },
      summary: "Widen an active project rule to global scope",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type ReviewLearningContract = typeof reviewLearningContract;
