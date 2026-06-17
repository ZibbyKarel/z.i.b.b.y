import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ResearchConfigSchema, ResearchDigestSchema } from "./research.schema"

const c = initContract()

/**
 * The research / intelligence layer API (M6). Config is operator-owned and
 * file-backed; the digest is assembled deterministically from the configured
 * sources and mirrored to the vault. `refresh` regenerates the digest now (the
 * same path a nightly automation takes); `getDigest` reads the latest persisted
 * digest (empty before the first pass).
 */
export const researchContract = c.router(
  {
    getConfig: {
      method: "GET",
      path: "/research/config",
      responses: { 200: ResearchConfigSchema },
      summary: "Get the operator research config",
    },
    putConfig: {
      method: "PUT",
      path: "/research/config",
      body: ResearchConfigSchema,
      responses: { 200: ResearchConfigSchema },
      summary: "Replace the operator research config",
    },
    getDigest: {
      method: "GET",
      path: "/research/digest",
      responses: { 200: ResearchDigestSchema },
      summary: "Get the latest research digest",
    },
    refresh: {
      method: "POST",
      path: "/research/refresh",
      body: z.object({}).optional(),
      responses: { 200: ResearchDigestSchema },
      summary: "Regenerate the research digest now",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
)
export type ResearchContract = typeof researchContract
