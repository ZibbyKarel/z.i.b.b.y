import { Injectable } from "@nestjs/common";
import { ArtifactsStorageService } from "../artifacts/artifacts.storage.service";
import { ScheduledTasksStorageService } from "../tasks/scheduled-tasks.storage.service";

/** `https://github.com/<owner>/<repo>/pull/<n>` → `n`, else null. */
export function prNumberFromUrl(url: string): number | null {
  const match = /\/pull\/(\d+)(?:$|[/?#])/.exec(url);
  if (!match?.[1]) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Which PRs ZIBBY itself opened for a project — the union of the two places the
 * system already records that, so nothing has to be guessed from a GitHub author
 * login (the operator's token opens both ZIBBY's PRs and their own):
 *
 * - the artifact registry (`kind: "pr"`), written by a pipeline's terminal PR sink
 * - a directed task's `outcome.pr`, written by the task scheduler
 *
 * Read-only and local — no network.
 */
@Injectable()
export class ZibbyPrLocator {
  constructor(
    private readonly artifacts: ArtifactsStorageService,
    private readonly tasks: ScheduledTasksStorageService,
  ) {}

  /** PR numbers for this project, newest first, deduped. */
  async numbersFor(projectId: string): Promise<number[]> {
    const numbers = new Set<number>();

    const artifacts = await this.artifacts.listFiltered({ projectId }).catch(() => []);
    for (const artifact of artifacts) {
      if (artifact.kind !== "pr") continue;
      const number = prNumberFromUrl(artifact.locator);
      if (number !== null) numbers.add(number);
    }

    const tasks = await this.tasks.list().catch(() => []);
    for (const task of tasks) {
      if (task.projectId !== projectId) continue;
      const url = task.outcome?.pr?.url;
      if (!url) continue;
      const number = prNumberFromUrl(url);
      if (number !== null) numbers.add(number);
    }

    return [...numbers].sort((a, b) => b - a);
  }
}
