import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { EmptyBodySchema, ErrorSchema } from "../common.schema";
import {
  ExternalSkillScanSchema,
  ExternalSkillsSyncResultSchema,
  InstallExternalSkillsSchema,
  ScanExternalSkillsSchema,
} from "./external-skill.schema";
import { SkillSchema } from "./skill.schema";

const c = initContract();

/**
 * Skills installed from a public GitHub repo (read-only in the library). Errors:
 * 400 not a github.com repo URL, 409 id already taken, 422 no SKILL.md found /
 * unknown path, 502 git failed. Sync: 404 not an installed external skill, 502
 * remote unreachable (the record still gets `lastError`).
 */
export const externalSkillsContract = c.router(
  {
    scanExternalSkills: {
      method: "POST",
      path: "/skills/external/scan",
      body: ScanExternalSkillsSchema,
      responses: {
        200: ExternalSkillScanSchema,
        400: ErrorSchema,
        422: ErrorSchema,
        502: ErrorSchema,
      },
      summary: "Clone a GitHub repo and list the SKILL.md folders it holds",
    },
    installExternalSkills: {
      method: "POST",
      path: "/skills/external",
      body: InstallExternalSkillsSchema,
      responses: {
        201: z.array(SkillSchema),
        400: ErrorSchema,
        409: ErrorSchema,
        422: ErrorSchema,
        502: ErrorSchema,
      },
      summary: "Install the chosen skill folders of a GitHub repo",
    },
    syncAllExternalSkills: {
      method: "POST",
      path: "/skills/external/sync",
      body: EmptyBodySchema,
      responses: { 200: ExternalSkillsSyncResultSchema },
      summary: "Check every installed external skill for upstream changes and apply them",
    },
    syncExternalSkill: {
      method: "POST",
      path: "/skills/external/:id/sync",
      body: EmptyBodySchema,
      responses: { 200: SkillSchema, 404: ErrorSchema, 502: ErrorSchema },
      summary: "Check one external skill for upstream changes and apply them",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type ExternalSkillsContract = typeof externalSkillsContract;
