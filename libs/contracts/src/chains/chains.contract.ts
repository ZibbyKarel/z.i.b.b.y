import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { DeleteResponseSchema, EmptyBodySchema, ErrorSchema } from "../common.schema";
import { ChainRunSchema, ChainSchema, CreateChainSchema } from "./chain.schema";

const c = initContract();

/**
 * Chain definitions (N2b) — operator-authored pipeline sequences. CRUD minus
 * update in v1 (recompose by delete + create); starting a chain lives on
 * `chainRunsContract`. Naming a chain IS an explicit target — no classifier is
 * involved anywhere on this surface (DNA: explicit target overrides).
 */
export const chainsContract = c.router(
  {
    listChains: {
      method: "GET",
      path: "/chains",
      responses: { 200: z.array(ChainSchema) },
      summary: "List chain definitions",
    },
    createChain: {
      method: "POST",
      path: "/chains",
      body: CreateChainSchema,
      responses: { 201: ChainSchema, 409: ErrorSchema, 422: ErrorSchema },
      summary: "Create a chain (every step's pipeline must exist)",
    },
    getChain: {
      method: "GET",
      path: "/chains/:id",
      responses: { 200: ChainSchema, 404: ErrorSchema },
      summary: "One chain definition",
    },
    deleteChain: {
      method: "DELETE",
      path: "/chains/:id",
      responses: { 200: DeleteResponseSchema, 404: ErrorSchema },
      summary: "Delete a chain definition (runs and artifacts are untouched)",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type ChainsContract = typeof chainsContract;

/**
 * Chain runs — start one, watch it advance. Reads poll state (a chain moves on
 * the minutes scale of whole pipeline runs; run-events SSE already pushes the
 * underlying pipeline transitions the feed listens to).
 */
export const chainRunsContract = c.router(
  {
    startChain: {
      method: "POST",
      path: "/chains/:id/run",
      body: EmptyBodySchema,
      responses: { 201: ChainRunSchema, 404: ErrorSchema, 422: ErrorSchema },
      summary: "Start a chain run (step 0 gets the chain instructions as input)",
    },
    listChainRuns: {
      method: "GET",
      path: "/chains/runs",
      responses: { 200: z.array(ChainRunSchema) },
      summary: "List chain runs (newest-first)",
    },
    getChainRun: {
      method: "GET",
      path: "/chains/runs/:id",
      responses: { 200: ChainRunSchema, 404: ErrorSchema },
      summary: "One chain run",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type ChainRunsContract = typeof chainRunsContract;
