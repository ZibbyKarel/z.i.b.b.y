import { initContract } from "@ts-rest/core";
import { ErrorSchema } from "../common.schema";
import { AutopilotStatusSchema, SetAutopilotInputSchema } from "./autopilot.schema";

const c = initContract();

/**
 * Autopilot (Phase 4). Turning it ON needs the operator token (401 without); turning
 * it OFF never does — tightening is always allowed, so the operator chat can switch
 * it off too (Law 4: nothing but the token can turn it on).
 */
export const autopilotContract = c.router(
  {
    getAutopilot: {
      method: "GET",
      path: "/autopilot",
      responses: { 200: AutopilotStatusSchema },
      summary: "Autopilot level, since when, by whom, and the pending approvals count",
    },
    setAutopilot: {
      method: "PUT",
      path: "/autopilot",
      body: SetAutopilotInputSchema,
      responses: { 200: AutopilotStatusSchema, 401: ErrorSchema },
      summary: "Set the autopilot level (on needs the operator token, off never does)",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);

export type AutopilotContract = typeof autopilotContract;
