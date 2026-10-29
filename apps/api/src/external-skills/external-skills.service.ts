import { randomBytes } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import type { ExternalSkillScan, Skill } from "@zibby/contracts";
import { withPathLock } from "../shared/file-storage";
import { SkillConflictError, SkillNotFoundError } from "../skills/skills.errors";
import { SkillsStorageService } from "../skills/skills.storage.service";
import { NoSkillsFoundError, SkillRepoGitError } from "./external-skills.errors";
import {
  EXTERNAL_SKILLS_DIR,
  ExternalSkillsStore,
  externalSkillDir,
} from "./external-skills.store";
import { type SkillCandidate, parseGitHubSkillUrl, scanSkillDir } from "./skill-repo";
import { SkillRepoGit } from "./skill-repo-git";

/** Serializes every install/update/remove of external skills. */
export const EXTERNAL_SKILLS_LOCK = "external-skills";

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
  constructor(
    private readonly store: ExternalSkillsStore,
    private readonly git: SkillRepoGit,
    private readonly skills: SkillsStorageService,
    @Inject(EXTERNAL_SKILLS_DIR) private readonly root: string,
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
      this.withClone(url, async ({ owner, repo, sha, candidates, dir }) => {
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
          await copySkillFolder(join(dir, c.path), externalSkillDir(c.id, this.root));
          await this.store.upsert({
            id: c.id,
            owner,
            repo,
            url,
            path: c.path,
            sha,
            treeSha,
            installedAt: now,
            updatedAt: now,
            checkedAt: now,
          });
        }
        return Promise.all(chosen.map((c) => this.skills.get(c.id)));
      }),
    );
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

  /** Shallow-clone `url` into a temp dir, scan it, run `fn`, always delete the clone. */
  private async withClone<T>(
    url: string,
    fn: (repo: {
      owner: string;
      repo: string;
      sha: string;
      candidates: SkillCandidate[];
      dir: string;
    }) => Promise<T>,
  ): Promise<T> {
    const { owner, repo, remote, subpath } = parseGitHubSkillUrl(url);
    const tmp = await mkdtemp(join(tmpdir(), "zibby-skill-repo-"));
    try {
      const dir = join(tmp, "repo");
      const sha = await this.git.clone(remote, dir);
      const candidates = await scanSkillDir(dir, subpath, repo);
      if (candidates.length === 0) throw new NoSkillsFoundError();
      return await fn({ owner, repo, sha, candidates, dir });
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }
}
