import { randomBytes } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  type ExternalSkillRecord,
  type ExternalSkillScan,
  type ExternalSkillUsage,
  type ExternalSkillsSyncResult,
  type Skill,
  type UninstallExternalSkillInput,
  type Workflow,
  WorkflowSchema,
} from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { withPathLock } from "../shared/file-storage";
import { SkillConflictError, SkillNotFoundError } from "../skills/skills.errors";
import { SkillsStorageService } from "../skills/skills.storage.service";
import { removePhase } from "../workflows/remove-phase";
import { InvalidWorkflowError } from "../workflows/workflows.errors";
import { WorkflowsStorageService } from "../workflows/workflows.storage.service";
import { NoSkillsFoundError, SkillInUseError, SkillRepoGitError } from "./external-skills.errors";
import {
  EXTERNAL_SKILLS_DIR,
  EXTERNAL_SKILLS_LOCK,
  ExternalSkillsStore,
  externalSkillDir,
} from "./external-skills.store";
import { type SkillCandidate, parseGitHubSkillUrl, scanSkillDir } from "./skill-repo";
import { SkillRepoGit } from "./skill-repo-git";

/**
 * Copy a skill folder from a clone into `destDir`, replacing what is there.
 * Never follows or copies a symlink, drops `.git`; lands via a sibling temp dir
 * + `rename`, so a failed copy leaves the previous folder intact.
 */
export async function copySkillFolder(src: string, destDir: string): Promise<void> {
  const tmp = `${destDir}.tmp-${randomBytes(4).toString("hex")}`;
  await mkdir(dirname(destDir), { recursive: true });
  try {
    await cp(src, tmp, {
      recursive: true,
      verbatimSymlinks: true,
      filter: async (from) => basename(from) !== ".git" && !(await lstat(from)).isSymbolicLink(),
    });
    await rm(destDir, { recursive: true, force: true });
    await rename(tmp, destDir);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

@Injectable()
export class ExternalSkillsService {
  private readonly logger = new Logger(ExternalSkillsService.name);

  constructor(
    private readonly store: ExternalSkillsStore,
    private readonly git: SkillRepoGit,
    private readonly skills: SkillsStorageService,
    @Inject(EXTERNAL_SKILLS_DIR) private readonly root: string,
    private readonly activity: ActivityLogService,
    private readonly workflows: WorkflowsStorageService,
  ) {}

  async scan(url: string): Promise<ExternalSkillScan> {
    return this.withClone(url, async ({ owner, repo, sha, candidates }) => ({
      owner,
      repo,
      sha,
      candidates: await Promise.all(
        candidates.map(async ({ path, id, name, desc }) => ({
          path,
          id,
          name,
          ...(desc ? { desc } : {}),
          conflict: await this.taken(id),
        })),
      ),
    }));
  }

  async install(url: string, paths: string[]): Promise<Skill[]> {
    return withPathLock(EXTERNAL_SKILLS_LOCK, () =>
      this.withClone(url, async ({ owner, repo, ref, sha, candidates, dir }) => {
        const chosen = [...new Set(paths)].map((p) => {
          const hit = candidates.find((c) => c.path === p);
          if (!hit) throw new NoSkillsFoundError(`No SKILL.md at "${p}" in ${owner}/${repo}`);
          return hit;
        });
        const ids = new Set<string>();
        for (const c of chosen) {
          if (ids.has(c.id) || (await this.taken(c.id))) throw new SkillConflictError(c.id);
          ids.add(c.id);
        }
        const now = new Date().toISOString();
        for (const c of chosen) {
          const treeSha = await this.git.treeSha(dir, c.path);
          if (!treeSha) throw new SkillRepoGitError(`git rev-parse: no tree for "${c.path}"`);
          const dest = externalSkillDir(c.id, this.root);
          await copySkillFolder(join(dir, c.path), dest);
          await this.store
            .upsert({
              id: c.id,
              owner,
              repo,
              url,
              ...(ref ? { ref } : {}),
              path: c.path,
              sha,
              treeSha,
              installedAt: now,
              updatedAt: now,
              checkedAt: now,
            })
            .catch(async (error: unknown) => {
              // No record → nothing would ever own this folder; don't leave it behind.
              await rm(dest, { recursive: true, force: true });
              throw error;
            });
        }
        return Promise.all(chosen.map((c) => this.skills.get(c.id)));
      }),
    );
  }

  /**
   * Check one external skill upstream and apply a change. A git failure is recorded
   * as `lastError` and rethrown (→ 502); a folder gone upstream only sets `lastError`.
   */
  async sync(id: string): Promise<Skill> {
    return withPathLock(EXTERNAL_SKILLS_LOCK, async () => {
      const record = await this.store.get(id);
      if (!record) throw new SkillNotFoundError(id);
      const { remote, ref } = parseGitHubSkillUrl(record.url);
      const { error } = await this.syncGroup(remote, ref, [record]);
      if (error) throw error;
      return this.skills.get(id);
    });
  }

  /** Check every external skill; one clone per `remote`+`ref`, a failing repo never stops the rest. */
  async syncAll(): Promise<ExternalSkillsSyncResult> {
    // ponytail: holds the lock for the whole (network-bound) run; per-group locking if own-skill creates stall.
    return withPathLock(EXTERNAL_SKILLS_LOCK, async () => {
      const records = await this.store.list();
      const updated: string[] = [];
      const failed: string[] = [];
      const groups = new Map<
        string,
        { remote: string; ref?: string; records: ExternalSkillRecord[] }
      >();
      for (const r of records) {
        let parsed: ReturnType<typeof parseGitHubSkillUrl>;
        try {
          parsed = parseGitHubSkillUrl(r.url);
        } catch (error) {
          // A hand-edited record; nothing to fetch.
          await this.saveQuietly({
            ...r,
            checkedAt: new Date().toISOString(),
            lastError: error instanceof Error ? error.message : String(error),
          });
          failed.push(r.id);
          continue;
        }
        const { remote, ref } = parsed;
        const key = `${remote}\0${ref ?? ""}`;
        const group = groups.get(key) ?? { remote, ...(ref ? { ref } : {}), records: [] };
        group.records.push(r);
        groups.set(key, group);
      }
      for (const { remote, ref, records: group } of groups.values()) {
        const result = await this.syncGroup(remote, ref, group);
        updated.push(...result.updated);
        failed.push(...result.failed);
      }
      return { checked: records.length, updated, failed };
    });
  }

  /**
   * `ls-remote` → records already at the head only move `checkedAt`; the rest share
   * one clone: missing folder → `lastError`, same tree → just move `sha`, new tree →
   * replace the folder and report `skill-updated`. A git failure stamps `lastError`
   * on every record not yet handled, lists them in `failed` and is returned as
   * `error` (never thrown). Caller holds the lock.
   */
  private async syncGroup(
    remote: string,
    ref: string | undefined,
    records: ExternalSkillRecord[],
  ): Promise<{ updated: string[]; failed: string[]; error?: unknown }> {
    const checkedAt = new Date().toISOString();
    // Every save clears a stale `lastError` unless the patch sets a new one.
    const save = (r: ExternalSkillRecord, patch: Partial<ExternalSkillRecord>) => {
      const next = { ...r, checkedAt, ...patch };
      if (patch.lastError === undefined) delete next.lastError;
      return this.store.upsert(next);
    };
    const updated: string[] = [];
    const failed: string[] = [];
    /** Ids whose outcome is already saved — a later git failure must not overwrite them. */
    const handled = new Set<string>();
    const fail = async (targets: ExternalSkillRecord[], error: unknown) => {
      const lastError = error instanceof Error ? error.message : String(error);
      for (const r of targets) await this.saveQuietly({ ...r, checkedAt, lastError });
      failed.push(...targets.map((r) => r.id));
      return { updated, failed, error };
    };

    let head: string;
    try {
      head = await this.git.lsRemoteHead(remote, ref);
    } catch (error) {
      return fail(records, error);
    }
    const stale = records.filter((r) => r.sha !== head);
    for (const r of records) if (r.sha === head) await save(r, { latestSha: head });
    if (stale.length === 0) return { updated, failed };

    try {
      await this.inTempClone(remote, ref, async (dir, sha) => {
        for (const r of stale) {
          const treeSha = await this.git.treeSha(dir, r.path);
          if (!treeSha) {
            await save(r, { latestSha: sha, lastError: "skill folder missing upstream" });
            failed.push(r.id);
          } else if (treeSha === r.treeSha) {
            await save(r, { sha, latestSha: sha });
          } else {
            try {
              await copySkillFolder(join(dir, r.path), externalSkillDir(r.id, this.root));
            } catch (error) {
              await save(r, { latestSha: sha, lastError: `copy failed: ${String(error)}` });
              failed.push(r.id);
              handled.add(r.id);
              continue;
            }
            await save(r, { sha, latestSha: sha, treeSha, updatedAt: checkedAt });
            updated.push(r.id);
            handled.add(r.id);
            await this.reportUpdate(r, sha);
            continue;
          }
          handled.add(r.id);
        }
      });
    } catch (error) {
      return fail(
        stale.filter((r) => !handled.has(r.id)),
        error,
      );
    }
    return { updated, failed };
  }

  /** Workflows whose phases name external skill `id`; an own/unknown id → SkillNotFoundError. */
  async usages(id: string): Promise<ExternalSkillUsage[]> {
    if (!(await this.store.get(id))) throw new SkillNotFoundError(id);
    return (await this.usingWorkflows(id)).map(({ workflow, phaseIds }) => ({
      workflowId: workflow.id,
      name: workflow.name ?? workflow.id,
      phaseIds,
    }));
  }

  /**
   * Uninstall external skill `id`. Every using workflow needs a decision (else
   * SkillInUseError): `"workflow"` deletes it, `"step"` drops the phases using the
   * skill. Every edited workflow is validated before anything is written, so an
   * InvalidWorkflowError (→ 422) leaves workflows, folder and record intact.
   */
  async uninstall(
    id: string,
    decisions: UninstallExternalSkillInput["workflows"],
  ): Promise<{ id: string }> {
    return withPathLock(EXTERNAL_SKILLS_LOCK, async () => {
      if (!(await this.store.get(id))) throw new SkillNotFoundError(id);
      const usages = await this.usingWorkflows(id);
      const undecided = usages.filter((u) => !decisions[u.workflow.id]).map((u) => u.workflow.id);
      if (undecided.length > 0) throw new SkillInUseError(id, undecided);

      const edits = usages
        .filter((u) => decisions[u.workflow.id] === "step")
        .map(({ workflow, phaseIds }) => {
          const phases = phaseIds.reduce(removePhase, workflow.phases);
          if (phases.length === 0)
            throw new InvalidWorkflowError(
              `Workflow "${workflow.id}" would have no phases left; delete the workflow instead`,
            );
          const parsed = WorkflowSchema.safeParse({ ...workflow, phases });
          if (!parsed.success)
            throw new InvalidWorkflowError(
              `Workflow "${workflow.id}": ${parsed.error.issues[0]?.message ?? "invalid workflow"}`,
            );
          return { id: workflow.id, phases };
        });

      // ponytail: not transactional — a disk error mid-way leaves earlier edits applied.
      for (const u of usages)
        if (decisions[u.workflow.id] === "workflow") await this.workflows.delete(u.workflow.id);
      for (const e of edits) await this.workflows.update(e.id, { phases: e.phases });
      await rm(this.skills.externalFolder(id), { recursive: true, force: true });
      await this.store.remove(id);
      return { id };
    });
  }

  private async usingWorkflows(id: string): Promise<{ workflow: Workflow; phaseIds: string[] }[]> {
    return (await this.workflows.list())
      .map((workflow) => ({
        workflow,
        phaseIds: workflow.phases.filter((p) => p.skill === id).map((p) => p.id),
      }))
      .filter((u) => u.phaseIds.length > 0);
  }

  /** Upsert a failure record; a write error is logged, never thrown (syncAll keeps going). */
  private async saveQuietly(record: ExternalSkillRecord): Promise<void> {
    try {
      await this.store.upsert(record);
    } catch (error) {
      this.logger.warn(`could not record lastError for ${record.id}: ${String(error)}`);
    }
  }

  private async reportUpdate(r: ExternalSkillRecord, sha: string): Promise<void> {
    let name = r.id;
    try {
      name = (await this.skills.get(r.id)).name ?? r.id;
    } catch {
      // A skill that no longer parses is still reported by id.
    }
    await this.activity.record({
      kind: "skill-updated",
      summary: `Skill ${name} aktualizován z ${r.owner}/${r.repo} (${r.sha.slice(0, 7)}→${sha.slice(0, 7)})`,
      refs: { itemId: r.id },
    });
  }

  /** Is `id` used by an own or an external skill (even a corrupt one)? */
  private async taken(id: string): Promise<boolean> {
    try {
      await this.skills.get(id);
      return true;
    } catch (error) {
      if (error instanceof SkillNotFoundError) return (await this.store.get(id)) !== undefined;
      return true;
    }
  }

  /** Shallow-clone `url`, scan it, run `fn`, always delete the clone. */
  private async withClone<T>(
    url: string,
    fn: (repo: {
      owner: string;
      repo: string;
      ref?: string;
      sha: string;
      candidates: SkillCandidate[];
      dir: string;
    }) => Promise<T>,
  ): Promise<T> {
    const { owner, repo, remote, ref, subpath } = parseGitHubSkillUrl(url);
    return this.inTempClone(remote, ref, async (dir, sha) => {
      const candidates = await scanSkillDir(dir, subpath, repo);
      if (candidates.length === 0) throw new NoSkillsFoundError();
      return fn({ owner, repo, ...(ref ? { ref } : {}), sha, candidates, dir });
    });
  }

  /** Shallow-clone `remote` at `ref` into a temp dir, run `fn(dir, headSha)`, always delete it. */
  private async inTempClone<T>(
    remote: string,
    ref: string | undefined,
    fn: (dir: string, sha: string) => Promise<T>,
  ): Promise<T> {
    const tmp = await mkdtemp(join(tmpdir(), "zibby-skill-repo-"));
    try {
      const dir = join(tmp, "repo");
      return await fn(dir, await this.git.clone(remote, dir, ref));
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }
}
