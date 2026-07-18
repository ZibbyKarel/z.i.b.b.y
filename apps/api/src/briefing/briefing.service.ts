import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import type {
  Briefing,
  BriefingSubsystemLine,
  CiStatus,
  SubsystemWithStatus,
  WatcherHealth,
} from "@zibby/contracts";
import { ACTIVITY_DIR, ActivityLogService } from "../activity/activity-log.service";
import { ApprovalsService } from "../approvals/approvals.service";
import { ChannelItemStore } from "../channels/channel-item.store";
import { DuplicateNoteError, VaultService } from "../memory/vault.service";
import { GoalRunnerService } from "../goals/goal-runner.service";
import { LimitsService } from "../limits/limits.service";
import { LoomService } from "../loom/loom.service";
import { MaestroService } from "../maestro/maestro.service";
import { MonitorEventStore } from "../monitors/monitor-event.store";
import { PipelineRunnerService } from "../pipelines/pipeline-runner.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { SelfKnowledgeService } from "../self-knowledge/self-knowledge.service";
import { SentinelService } from "../sentinel/sentinel.service";
import { WatcherHealthRegistry } from "../health/watcher-health.registry";
import { SubsystemsService } from "../subsystems/subsystems.service";
import { ScheduledTasksStorageService } from "../tasks/scheduled-tasks.storage.service";
import { ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { assembleBriefing, renderBriefingMarkdown } from "./briefing-assembly";
import { ClaudeCliBriefer } from "./claude-cli-briefer";

/** The cursor file that records when the last briefing was generated (decision 11). */
const CURSOR_FILE = "last-briefing.json";

/** Start-of-day ISO for `now` — the since-fallback on first boot / deleted cursor. */
function startOfDay(now: Date): string {
  return `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
}

/**
 * NS2 F3b — shape the gathered subsystem rows into briefing lines (pure; the
 * service gathers, `assembleBriefing` formats — mirrors the `ciStatuses` split).
 * Two mandate-specific notes: Ledger carries the weekly usage window %, Puls
 * carries CI health from the already-gathered statuses. Beacon needs no note —
 * its Tier-3 mandate is honored by `tier3Count`.
 */
function buildSubsystemLines(
  rows: SubsystemWithStatus[],
  ciStatuses: CiStatus[],
  weeklyPct: number | null,
): BriefingSubsystemLine[] {
  const redCi = ciStatuses.filter((s) => s.state === "red").length;
  return rows.map((s) => {
    let note: string | undefined;
    if (s.id === "ledger" && weeklyPct !== null) note = `${weeklyPct} % týdenního okna`;
    if (s.id === "puls" && ciStatuses.length > 0)
      note = redCi > 0 ? `CI červená (${redCi})` : "CI zelené";
    return {
      subsystem: s.id,
      name: s.name,
      state: s.state,
      tier2Count: s.tier2Count,
      tier3Count: s.tier3Count,
      ...(note ? { note } : {}),
    };
  });
}

/**
 * NS2 F6c — one stale watcher as a briefing line (pure). English to match the
 * record the briefing is assembled from, e.g.
 * `channel watcher stale — last tick 5 m ago (interval 30 s)`.
 */
function formatStaleWatcher(w: WatcherHealth): string {
  const age =
    w.ageMs !== undefined ? `last tick ${Math.round(w.ageMs / 60_000)} m ago` : "never ticked";
  const detail = w.detail ? ` — ${w.detail}` : "";
  return `${w.id} watcher stale — ${age} (interval ${Math.round(w.tickMs / 1000)} s)${detail}`;
}

/**
 * The briefing generator (Phase 6.2). {@link assemble} is a PURE read — pending
 * approvals + parked runs + in-flight channel items + activity since the cursor →
 * a {@link Briefing}, zero side effects (the GET endpoint and the card call this).
 * {@link generate} additionally runs the optional butler-voice pass, persists the
 * prose to the vault (one note per day — re-generate updates, never collides),
 * links it from the daily note, advances the cursor (only AFTER the note persists,
 * so a crash re-briefs idempotently) and records a `briefing-generated` entry.
 */
@Injectable()
export class BriefingService {
  private readonly log: ScopedLogger;

  constructor(
    private readonly approvals: ApprovalsService,
    private readonly pipelines: PipelineRunnerService,
    private readonly goals: GoalRunnerService,
    private readonly channels: ChannelItemStore,
    private readonly activity: ActivityLogService,
    private readonly briefer: ClaudeCliBriefer,
    private readonly vault: VaultService,
    private readonly tasks: ScheduledTasksStorageService,
    private readonly projects: ProjectsStorageService,
    private readonly monitorEvents: MonitorEventStore,
    // NS2 F3b — per-subsystem grouping lines (state + tier counts) and the
    // Ledger note's weekly usage window %.
    private readonly subsystems: SubsystemsService,
    private readonly limits: LimitsService,
    // NS2 F4c — nightly self-knowledge drift check (true = the vault note has
    // drifted from a fresh compose; the scheduled refresh may have failed).
    private readonly selfKnowledge: SelfKnowledgeService,
    // NS2 F5a — Sentinel's open security findings (CVE/secret), read off its
    // vault note for the briefing's extras array.
    private readonly sentinel: SentinelService,
    // NS2 F5b — Maestro's merge-queue summary lines for the briefing's extras array.
    private readonly maestro: MaestroService,
    // NS2 F5c — Loom's quality findings for the briefing's extras array.
    private readonly loom: LoomService,
    // NS2 F6c — stale heartbeat watchers (fail-open: a stale watcher is a
    // briefing line, never a red /health).
    private readonly watchers: WatcherHealthRegistry,
    @Inject(ACTIVITY_DIR) private readonly activityDir: string,
    logger: LoggerService,
  ) {
    this.log = logger.child(BriefingService.name);
  }

  /** Assemble the current briefing from the record — pure, no persistence. */
  async assemble(now: Date = new Date()): Promise<Briefing> {
    const since = await this.readCursor(now);
    const [
      approvals,
      allRuns,
      allGoalRuns,
      channelItems,
      activity,
      allTasks,
      projects,
      ciStatuses,
      subsystemRows,
      weeklyPct,
      selfKnowledgeDrift,
    ] = await Promise.all([
      this.approvals.list("pending"),
      this.pipelines.listAll(),
      this.goals.listAll(),
      this.channels.list(),
      this.activity.readSince(since, now),
      this.tasks.list().catch(() => []),
      this.projects.list().catch(() => []),
      // N4b: last known CI health — a red one becomes a needs-you state line.
      this.monitorEvents.listStatuses().catch(() => []),
      // NS2 F3b — per-subsystem lines. `.catch`-guarded like every other extra:
      // a failed read drops the section, never the briefing (null ≠ empty list).
      this.subsystems.list().catch((): SubsystemWithStatus[] | null => null),
      this.limits
        .snapshot()
        .then((l) => l.weekly.usedPct)
        .catch((): number | null => null),
      // NS2 F4c — self-knowledge drift check. Fail-open: a read failure must
      // never surface a false drift flag, so it collapses to `false`.
      this.selfKnowledge.check().catch(() => false),
    ]);
    // Phase 10: in-flight (running/paused) goals feed "watching"; parked goals "needs you".
    const goalRuns = allGoalRuns.filter(
      (g) => g.status === "running" || g.status === "paused-limit" || g.status === "parked",
    );
    const parkedRuns = allRuns.filter((r) => r.status === "parked");
    // Phase 9: runs paused on the usage limit feed the "watching" line (Tier 1 — they
    // auto-resume, so they don't go in "needs you").
    const pausedLimitRuns = allRuns.filter((r) => r.status === "paused-limit");
    const inFlight = channelItems.filter((i) => i.state === "new" || i.state === "triaged");
    // Only the still-waiting tasks feed the engagement rollup (queued / held).
    const tasks = allTasks.filter((t) => t.status === "queued" || t.status === "held");
    // M8: dead-lettered tasks (dispatch exhausted its retries) are a needs-you decision.
    const deadLetteredTasks = allTasks.filter((t) => t.status === "dead-letter");
    const projectNames = Object.fromEntries(projects.map((p) => [p.id, p.name]));
    const [
      trend7d,
      learnedPatterns,
      automationGaps,
      appIdeas,
      securityFindings,
      mergeQueue,
      qualityFindings,
      staleWatchers,
    ] = await Promise.all([
      this.readTrend7d(now),
      this.readLearnedPatterns(),
      this.readAutomationGaps(),
      this.readAppIdeas(),
      // NS2 F5a — Sentinel's open findings. `.catch`-guarded like every other
      // extra: a failed read drops the section, never the briefing.
      this.sentinel.readFindings().catch((): string[] => []),
      // NS2 F5b — Maestro's per-project merge-queue summary lines. Same
      // fail-open guard: a failed read drops the section, never the briefing.
      this.maestro.summaryLines().catch((): string[] => []),
      // NS2 F5c — Loom's quality findings. Same fail-open guard: a failed read
      // drops the section, never the briefing.
      this.loom.readFindings().catch((): string[] => []),
      // NS2 F6c — heartbeat watchers currently probing stale. Same fail-open
      // guard: a failed read drops the section, never the briefing.
      Promise.resolve()
        .then(() =>
          this.watchers
            .all()
            .filter((w) => w.status === "stale")
            .map(formatStaleWatcher),
        )
        .catch((): string[] => []),
    ]);
    const subsystems = subsystemRows
      ? buildSubsystemLines(subsystemRows, ciStatuses, weeklyPct)
      : undefined;
    return assembleBriefing({
      now,
      since,
      approvals,
      parkedRuns,
      pausedLimitRuns,
      goalRuns,
      channelItems: inFlight,
      activity,
      tasks,
      deadLetteredTasks,
      ciStatuses,
      projectNames,
      trend7d,
      learnedPatterns,
      automationGaps,
      appIdeas,
      securityFindings,
      mergeQueue,
      qualityFindings,
      staleWatchers,
      ...(subsystems ? { subsystems } : {}),
      ...(selfKnowledgeDrift ? { selfKnowledgeDrift } : {}),
    });
  }

  /**
   * Generate, persist and record a briefing. Returns the briefing plus the vault
   * note id (`briefing-<YYYY-MM-DD>`).
   */
  async generate(
    now: Date = new Date(),
    focus?: string,
  ): Promise<{ briefing: Briefing; noteId: string }> {
    const assembled = await this.assemble(now);
    // Optional butler voice; never blocks — the deterministic headline stands in. The
    // `focus` (an automation's prompt) steers the voice, e.g. "keep it terse".
    const voiced = await this.briefer.headline(assembled, focus).catch(() => null);
    const briefing: Briefing = voiced ? { ...assembled, headline: voiced } : assembled;

    const noteId = `briefing-${now.toISOString().slice(0, 10)}`;
    await this.persistNote(noteId, briefing);
    await this.vault.appendDaily(`briefing generated → [[${noteId}]]`).catch((err) => {
      this.log.warn("daily briefing link failed", { error: (err as Error).message });
    });
    // Advance the cursor ONLY after the note persists (crash → idempotent re-brief).
    await this.writeCursor(briefing.generatedAt);
    void this.activity.record({
      kind: "briefing-generated",
      summary: briefing.headline,
      refs: { noteId },
    });
    this.log.info("briefing generated", { noteId, needsYou: briefing.needsYou.length });
    return { briefing, noteId };
  }

  /** Create the day's briefing note, or update it if today's was already generated. */
  private async persistNote(noteId: string, briefing: Briefing): Promise<void> {
    const body = renderBriefingMarkdown(briefing);
    const frontmatter = { generatedAt: briefing.generatedAt, since: briefing.since };
    try {
      await this.vault.createNote({
        id: noteId,
        tier: "daily",
        title: "Briefing",
        body,
        frontmatter,
      });
    } catch (error) {
      // One note per day is the contract — a second generate updates, never 409s.
      if (!(error instanceof DuplicateNoteError)) throw error;
      await this.vault.updateNote(noteId, { body, frontmatter });
    }
  }

  /**
   * Read the latest pattern proposals from the vault (`patterns/suggestions`),
   * parsing `- [ ] …` and `- [x] …` bullet lines. Returns [] on any error.
   */
  private async readLearnedPatterns(): Promise<string[]> {
    try {
      const note = await this.vault.note("patterns/suggestions");
      return (note.body ?? "")
        .split("\n")
        .filter((l) => l.startsWith("- [ ] ") || l.startsWith("- [x] "))
        .map((l) => l.replace(/^- \[.\] /, "").trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Read the GapDetector's "automate it?" suggestions from the vault
   * (`suggestions/automation-gaps`), parsing the `- [ ] …` bullet lines. Caps at the
   * first 5. [] on error.
   */
  private async readAutomationGaps(): Promise<string[]> {
    try {
      const note = await this.vault.note("suggestions/automation-gaps");
      return (note.body ?? "")
        .split("\n")
        .filter((l) => l.startsWith("- [ ] ") || l.startsWith("- [x] "))
        .map((l) => l.replace(/^- \[.\] /, "").trim())
        .filter(Boolean)
        .slice(0, 5);
    } catch {
      return [];
    }
  }

  /**
   * Read the weekly "3 app ideas" from the vault (`suggestions/app-ideas`), parsing
   * the `- [ ] …` bullet lines. Caps at the first 3. [] on error.
   */
  private async readAppIdeas(): Promise<string[]> {
    try {
      const note = await this.vault.note("suggestions/app-ideas");
      return (note.body ?? "")
        .split("\n")
        .filter((l) => l.startsWith("- [ ] ") || l.startsWith("- [x] "))
        .map((l) => l.replace(/^- \[.\] /, "").trim())
        .filter(Boolean)
        .slice(0, 3);
    } catch {
      return [];
    }
  }

  /** Read the since-cursor; tolerant — a missing/garbage cursor → start of today. */
  private async readCursor(now: Date): Promise<string> {
    const raw = await fs
      .readFile(path.join(this.activityDir, CURSOR_FILE), "utf8")
      .catch(() => null);
    if (raw === null) return startOfDay(now);
    const parsed = safeJson(raw);
    const at =
      parsed && typeof parsed === "object"
        ? (parsed as { generatedAt?: unknown }).generatedAt
        : undefined;
    return typeof at === "string" ? at : startOfDay(now);
  }

  private async writeCursor(generatedAt: string): Promise<void> {
    await ensureDir(this.activityDir);
    await writeFileAtomic(
      path.join(this.activityDir, CURSOR_FILE),
      JSON.stringify({ generatedAt }),
    );
  }

  /**
   * Read the first non-empty line from each of the past 7 daily vault notes as a
   * trend summary. Missing days are silently skipped — never throws.
   */
  private async readTrend7d(now: Date): Promise<string[]> {
    const summaries: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const date = d.toISOString().slice(0, 10);
      try {
        const note = await this.vault.note(date);
        const firstLine = (note.body ?? "").split("\n").find((l) => l.trim().length > 0);
        if (firstLine) summaries.push(`${date}: ${firstLine.replace(/^[-*]\s*/, "").trim()}`);
      } catch {
        // Day not found or unreadable — skip silently.
      }
    }
    return summaries;
  }
}
