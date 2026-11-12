import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";
import { ProjectIdSchema } from "../projects/project.schema";

/**
 * todo-10 — CI state of one unit (step, job, workflow run, or the whole base branch). `skipped`
 * covers GitHub's skipped / neutral; `none` = nothing ran (or no CI link); `error` = the repo
 * could not be read (rate limit, no access) — only ever the whole branch's state.
 */
export const CiStateSchema = z.enum([
  "passing",
  "failing",
  "running",
  "pending",
  "cancelled",
  "skipped",
  "none",
  "error",
]);
export type CiState = z.infer<typeof CiStateSchema>;

export const CiStepSchema = z.object({
  number: z.number().int(),
  name: z.string(),
  state: CiStateSchema,
});
export type CiStep = z.infer<typeof CiStepSchema>;

export const CiJobSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  url: z.string().optional(),
  state: CiStateSchema,
  steps: z.array(CiStepSchema),
});
export type CiJob = z.infer<typeof CiJobSchema>;

/** One workflow run on the base branch's newest commit that has runs. */
export const CiWorkflowRunSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  url: z.string().optional(),
  state: CiStateSchema,
  jobs: z.array(CiJobSchema),
});
export type CiWorkflowRun = z.infer<typeof CiWorkflowRunSchema>;

/**
 * Base-branch CI of a project (`GET /api/project-ci/:projectId`). `provider: "none"` = no
 * GitHub link; `gitlab` is recognised from `gitRemote` but not read yet (deferred) — both
 * come back with `state: "none"` and no workflows, never an error.
 */
export const ProjectCiSchema = z.object({
  projectId: ProjectIdSchema,
  provider: z.enum(["github", "gitlab", "none"]),
  /** Repo root on GitHub / GitLab. */
  repoUrl: z.string().optional(),
  /** The base (default) branch. */
  branch: z.string().optional(),
  headSha: z.string().optional(),
  state: CiStateSchema,
  /** Why the repo could not be read (`state: "error"`). */
  error: z.string().optional(),
  workflows: z.array(CiWorkflowRunSchema),
  /** An open "Fix CI" task for `headSha` (`ScheduledTask.baseFixCi`) — the button shows it running. */
  fixTaskId: z.string().optional(),
  checkedAt: IsoDateTimeSchema,
});
export type ProjectCi = z.infer<typeof ProjectCiSchema>;

export const FixProjectCiResultSchema = z.object({ taskId: z.string() });
export type FixProjectCiResult = z.infer<typeof FixProjectCiResultSchema>;
