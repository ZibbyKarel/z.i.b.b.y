import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import { ArtifactListQuerySchema, ArtifactRecordSchema } from "./artifact.schema";

const c = initContract();

/**
 * Artifacts (N2a): READ-ONLY access to the durable artifact registry. Records are
 * born only inside the API process — the pipeline delivery sinks write one at
 * delivery time — so a client can never forge provenance. The N2 chain primitive
 * and the run/pipeline detail surfaces read through this route.
 */
export const artifactsContract = c.router(
  {
    listArtifacts: {
      method: "GET",
      path: "/artifacts",
      query: ArtifactListQuerySchema,
      responses: { 200: z.array(ArtifactRecordSchema) },
      summary: "List durable artifact records (newest-first)",
    },
    getArtifact: {
      method: "GET",
      path: "/artifacts/:id",
      responses: { 200: ArtifactRecordSchema, 404: ErrorSchema },
      summary: "One artifact record by id",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type ArtifactsContract = typeof artifactsContract;
