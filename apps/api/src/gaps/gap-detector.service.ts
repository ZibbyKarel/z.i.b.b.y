import { Injectable } from "@nestjs/common";
import { ActivityLogService } from "../activity/activity-log.service";
import { VaultService } from "../memory/vault.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";

/** Minimum repeats of a normalised task summary to qualify as an automation gap. */
const MIN_OCCURRENCES = 3;

/** Max gaps written to the automation-gaps vault note. */
const MAX_GAPS = 10;

/** Days of activity scanned for recurring manual work. */
const WINDOW_DAYS = 30;

/** The vault note recurring-gap suggestions are written to (read by the briefing). */
const NOTE_ID = "suggestions/automation-gaps";

export interface AutomationGap {
  /** The normalised summary the recurring tasks share. */
  pattern: string;
  /** A representative original summary (first seen). */
  sample: string;
  count: number;
}

export interface GapDetectResult {
  gaps: AutomationGap[];
  suggestions: string[];
}

/**
 * The GapDetector (M5, north-star "detects gaps... proposes automation rules").
 * Scans the past {@link WINDOW_DAYS} of `task-created` activity for recurring
 * manual work — tasks the operator (or a channel) keeps creating by hand — groups
 * them by a normalised summary, and drafts "I noticed X — automate it?" suggestions
 * into `vault/suggestions/automation-gaps.md` for the morning briefing to surface.
 *
 * Deterministic — no LLM call. *Proposes ≠ acts*: it only writes a vault note; it
 * never creates an automation. Reading only + an idempotent vault overwrite.
 */
@Injectable()
export class GapDetectorService {
  private readonly log: ScopedLogger;

  constructor(
    private readonly activity: ActivityLogService,
    private readonly vault: VaultService,
    logger: LoggerService,
  ) {
    this.log = logger.child(GapDetectorService.name);
  }

  /** Scan recurring task creation → draft automation-gap suggestions in the vault. */
  async detect(now: Date = new Date()): Promise<GapDetectResult> {
    const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const entries = await this.activity.readRange(since, now).catch(() => []);

    const tally = new Map<string, AutomationGap>();
    for (const entry of entries) {
      if (entry.kind !== "task-created") continue;
      const key = normalize(entry.summary);
      if (!key) continue;
      const existing = tally.get(key);
      if (existing) existing.count += 1;
      else tally.set(key, { pattern: key, sample: entry.summary.trim(), count: 1 });
    }

    const gaps = [...tally.values()]
      .filter((g) => g.count >= MIN_OCCURRENCES)
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_GAPS);
    const suggestions = gaps.map(toSuggestion);

    if (suggestions.length > 0) {
      await this.writeGaps(suggestions, now).catch((err) => {
        this.log.warn("failed to write automation gaps to vault", {
          error: (err as Error).message,
        });
      });
    }
    this.log.info("gap detection complete", { scanned: entries.length, gaps: gaps.length });
    return { gaps, suggestions };
  }

  /** Read the latest gap suggestions from the vault note (for the briefing). */
  async readGaps(): Promise<string[]> {
    try {
      const note = await this.vault.note(NOTE_ID);
      return parseGapsFromNote(note.body ?? "");
    } catch {
      return [];
    }
  }

  private async writeGaps(suggestions: string[], now: Date): Promise<void> {
    const date = now.toISOString().slice(0, 10);
    const body = [
      `*Updated: ${date}*`,
      "",
      "Recurring manual work that could become an automation:",
      "",
      ...suggestions.map((s) => `- [ ] ${s}`),
      "",
      "_Approve a line to turn the recurring task into an automation._",
    ].join("\n");
    try {
      await this.vault.updateNote(NOTE_ID, { body });
    } catch {
      await this.vault.createNote({ id: NOTE_ID, title: "Automation Gaps", tier: "memory", body });
    }
  }
}

/** Lowercase, strip punctuation to spaces, collapse whitespace, cap length for grouping. */
function normalize(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function toSuggestion(gap: AutomationGap): string {
  return `You created ${gap.count} similar tasks ("${gap.sample}") in the past ${WINDOW_DAYS} days — automate it?`;
}

/** Extract the `- [ ] …` / `- [x] …` bullet lines from the gaps note body. */
function parseGapsFromNote(body: string): string[] {
  return body
    .split("\n")
    .filter((l) => l.startsWith("- [ ] ") || l.startsWith("- [x] "))
    .map((l) => l.replace(/^- \[.\] /, "").trim())
    .filter(Boolean);
}
