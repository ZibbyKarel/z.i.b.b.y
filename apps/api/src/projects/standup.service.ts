import { Injectable } from "@nestjs/common"
import type { ActivityEntry, ProjectStandup } from "@zibby/contracts"
import { ActivityLogService } from "../activity/activity-log.service"
import { VaultService } from "../memory/vault.service"
import { ProjectNotFoundError } from "./projects.errors"
import { ProjectsStorageService } from "./projects.storage.service"

/** Activity kinds that represent completed work (Yesterday section). */
const DONE_KINDS = new Set([
  "task-outcome",
  "run-finished",
  "pipeline-finished",
  "channel-reply",
  "approval-approved",
  "approval-rejected",
  "goal-verdict",
])

/** Activity kinds that signal something is blocked or needs attention (Blockers section). */
const BLOCKED_KINDS = new Set([
  "approval-requested",
  "channel-approval",
  "pipeline-parked",
  "goal-parked",
  "task-held",
])

/** Activity kinds that represent ongoing work (In Progress section). */
const PROGRESS_KINDS = new Set([
  "task-dispatched",
  "run-started",
  "pipeline-started",
  "goal-dispatched",
  "channel-triage",
])

/**
 * Per-project standup cheat sheet generator (M3). Reads the past 24h of activity
 * filtered to the project and assembles a Yesterday / In Progress / Blockers summary.
 * Pure deterministic assembly — no LLM, no I/O beyond what it injects. Results are
 * cached in memory (single process) until the next `generate()` call.
 */
@Injectable()
export class StandupService {
  private readonly cache = new Map<string, ProjectStandup>()

  constructor(
    private readonly projects: ProjectsStorageService,
    private readonly activity: ActivityLogService,
    private readonly vault: VaultService,
  ) {}

  /** Return the cached standup for a project, or null if none has been generated yet. */
  async get(projectId: string): Promise<ProjectStandup | null> {
    const hit = this.cache.get(projectId)
    if (hit) return hit
    // On first call, generate so the operator always gets something useful.
    return this.generate(projectId)
  }

  /**
   * Generate (or regenerate) a standup cheat sheet for the project from the past 24h
   * of activity. Writes a bullet to today's vault daily note, stores in cache, and
   * returns the standup object.
   */
  async generate(projectId: string, now: Date = new Date()): Promise<ProjectStandup> {
    const project = await this.projects.get(projectId).catch(() => null)
    if (!project) throw new ProjectNotFoundError(projectId)

    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const entries = await this.activity.readSince(since, now).catch(() => [])

    // Include entries attributed to this project OR global entries (no projectId).
    const relevant = entries.filter((e) => !e.refs.projectId || e.refs.projectId === projectId)

    const done = relevant.filter((e) => DONE_KINDS.has(e.kind))
    const inProgress = relevant.filter((e) => PROGRESS_KINDS.has(e.kind))
    const blockers = relevant.filter((e) => BLOCKED_KINDS.has(e.kind))

    const date = now.toISOString().slice(0, 10)
    const text = renderStandup(project.name, date, done, inProgress, blockers)

    void this.vault.appendDaily(`Standup ${project.name}: ${summariseCounts(done, inProgress, blockers)}`)

    const standup: ProjectStandup = {
      projectId,
      date,
      generatedAt: now.toISOString(),
      text,
    }
    this.cache.set(projectId, standup)
    return standup
  }
}

// ---------------------------------------------------------------------------
// Pure rendering helpers
// ---------------------------------------------------------------------------

function renderStandup(
  name: string,
  date: string,
  done: ActivityEntry[],
  inProgress: ActivityEntry[],
  blockers: ActivityEntry[],
): string {
  const lines: string[] = [`## Standup — ${name} — ${date}`, ""]

  lines.push("### Yesterday")
  if (done.length === 0) {
    lines.push("- No completed activity recorded in the past 24h.")
  } else {
    for (const e of done.slice(0, 10)) lines.push(`- ${e.summary}`)
  }

  lines.push("", "### In Progress")
  if (inProgress.length === 0) {
    lines.push("- No in-progress activity recorded.")
  } else {
    for (const e of inProgress.slice(0, 10)) lines.push(`- ${e.summary}`)
  }

  lines.push("", "### Blockers / Needs Review")
  if (blockers.length === 0) {
    lines.push("- Nothing blocked.")
  } else {
    for (const e of blockers.slice(0, 10)) lines.push(`- ${e.summary}`)
  }

  return lines.join("\n")
}

function summariseCounts(
  done: ActivityEntry[],
  inProgress: ActivityEntry[],
  blockers: ActivityEntry[],
): string {
  return `${done.length} done, ${inProgress.length} in progress, ${blockers.length} blocked`
}
