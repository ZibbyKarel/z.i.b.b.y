import { initContract } from "@ts-rest/core";
import { ErrorSchema } from "../common.schema";
import { MandateSchema, MandateWriteSchema } from "./mandate.schema";

const c = initContract();

/**
 * The autonomy mandate (Phase 5.3): a single operator-owned document. GET returns
 * the current mandate (seeded if absent); PUT replaces it, validated against the
 * strict schema — a 422 on any unknown key, so a channel item can never widen
 * autonomy through it (Law 4). There is exactly one mandate; no id, no list.
 */
export const mandateContract = c.router(
  {
    getMandate: {
      method: "GET",
      path: "/mandate",
      responses: { 200: MandateSchema },
      summary: "Get the autonomy mandate",
    },
    setMandate: {
      method: "PUT",
      path: "/mandate",
      body: MandateWriteSchema,
      responses: { 200: MandateSchema, 422: ErrorSchema },
      summary: "Replace the autonomy mandate (strict — rejects unknown keys)",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type MandateContract = typeof mandateContract;
