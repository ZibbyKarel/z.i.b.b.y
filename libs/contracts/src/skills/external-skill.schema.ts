import { z } from "zod";
import { AgentIdSchema } from "../agents/agent.schema";

/**
 * Provenance of a skill installed from a public GitHub repo. The library treats
 * such a skill as read-only; `sha` pins the installed commit, `treeSha` the
 * installed folder's git tree (so an update can tell whether the folder changed).
 */
export const SkillSourceSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  /** The URL as the operator pasted it. */
  url: z.string(),
  /** Branch/tag from a `/tree/<ref>` URL; absent = the repo's default branch. */
  ref: z.string().optional(),
  /** Repo-relative folder holding the SKILL.md; "" for the repo root. */
  path: z.string(),
  sha: z.string(),
  treeSha: z.string(),
  installedAt: z.string(),
  updatedAt: z.string(),
  checkedAt: z.string(),
  latestSha: z.string().optional(),
  lastError: z.string().optional(),
});
export type SkillSource = z.infer<typeof SkillSourceSchema>;

/** One row of `external-skills.json`. */
export const ExternalSkillRecordSchema = SkillSourceSchema.extend({ id: AgentIdSchema });
export type ExternalSkillRecord = z.infer<typeof ExternalSkillRecordSchema>;

export const ScanExternalSkillsSchema = z.object({ url: z.string().min(1) });

export const ExternalSkillCandidateSchema = z.object({
  path: z.string(),
  id: z.string(),
  name: z.string(),
  desc: z.string().optional(),
  /** The id is already taken by an own or an external skill. */
  conflict: z.boolean(),
});
export type ExternalSkillCandidate = z.infer<typeof ExternalSkillCandidateSchema>;

export const ExternalSkillScanSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  sha: z.string(),
  candidates: z.array(ExternalSkillCandidateSchema),
});
export type ExternalSkillScan = z.infer<typeof ExternalSkillScanSchema>;

export const InstallExternalSkillsSchema = z.object({
  url: z.string().min(1),
  paths: z.array(z.string()).min(1),
});
export type InstallExternalSkillsInput = z.infer<typeof InstallExternalSkillsSchema>;

/** Result of `POST /skills/external/sync`: ids updated / failed out of `checked` records. */
export const ExternalSkillsSyncResultSchema = z.object({
  checked: z.number().int().nonnegative(),
  updated: z.array(z.string()),
  failed: z.array(z.string()),
});
export type ExternalSkillsSyncResult = z.infer<typeof ExternalSkillsSyncResultSchema>;
