import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { EmptyBodySchema, ErrorSchema } from "../common.schema";
import {
  ExternalSkillScanSchema,
  ExternalSkillUsageSchema,
  ExternalSkillsSyncResultSchema,
  InstallExternalSkillsSchema,
  ScanExternalSkillsSchema,
  UninstallExternalSkillSchema,
} from "./external-skill.schema";
import { SkillSchema } from "./skill.schema";

const c = initContract();

/**
 * Skills installed from a public GitHub repo (read-only in the library). Errors:
 * 400 not a github.com repo URL, 409 id already taken, 422 no SKILL.md found /
 * unknown path, 502 git failed. Sync: 404 not an installed external skill, 502
 * remote unreachable (the record still gets `lastError`). Uninstall: 404 not an
 * external skill, 409 a using workflow has no decision, 422 dropping the step
 * leaves a workflow invalid (nothing is changed on any error).
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
    externalSkillUsages: {
      method: "GET",
      path: "/skills/external/:id/usages",
      responses: { 200: z.array(ExternalSkillUsageSchema), 404: ErrorSchema },
      summary: "List the workflows whose phases use this external skill",
    },
    uninstallExternalSkill: {
      method: "POST",
      path: "/skills/external/:id/uninstall",
      body: UninstallExternalSkillSchema,
      responses: {
        200: z.object({ id: z.string() }),
        404: ErrorSchema,
        409: ErrorSchema,
        422: ErrorSchema,
      },
      summary: "Uninstall an external skill, deleting or editing the workflows that use it",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type ExternalSkillsContract = typeof externalSkillsContract;
