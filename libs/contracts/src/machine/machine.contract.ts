import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import { MachineActionRecordSchema, ProposeMachineActionSchema } from "./machine.schema";

const c = initContract();

/**
 * Machine actions (N5a) — propose-only. POST computes the dry-run preview and
 * parks the Tier-3 approval; there is deliberately NO execute endpoint —
 * execution happens exclusively through the approval gate (the gate cannot be
 * talked around). Records are read-only thereafter.
 */
export const machineContract = c.router(
  {
    proposeMachineAction: {
      method: "POST",
      path: "/machine/actions",
      body: ProposeMachineActionSchema,
      responses: {
        201: MachineActionRecordSchema,
        422: ErrorSchema,
      },
      summary: "Propose a machine action (dry-run preview + Tier-3 approval; never executes)",
    },
    listMachineActions: {
      method: "GET",
      path: "/machine/actions",
      responses: { 200: z.array(MachineActionRecordSchema) },
      summary: "List machine action records (newest-first)",
    },
    getMachineAction: {
      method: "GET",
      path: "/machine/actions/:id",
      responses: { 200: MachineActionRecordSchema, 404: ErrorSchema },
      summary: "One machine action record by id",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type MachineContract = typeof machineContract;
