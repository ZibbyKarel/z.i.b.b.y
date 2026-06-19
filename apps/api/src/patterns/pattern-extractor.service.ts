import { Injectable } from "@nestjs/common";
import { ActivityLogService } from "../activity/activity-log.service";
import { VaultService } from "../memory/vault.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";

/** Minimum occurrences of the same action+decision pair to qualify as a pattern. */
const MIN_OCCURRENCES = 3;

/** Max proposals written to the suggestions vault note. */
const MAX_PROPOSALS = 10;

export interface ApprovalPattern {
  action: string;
  decision: "approved" | "rejected";
  count: number;
}

export interface PatternExtractResult {
  patterns: ApprovalPattern[];
  proposals: string[];
}

/**
 * Scans the past 30 days of approval-decision activity, finds recurring
 * action+decision pairs (≥ {@link MIN_OCCURRENCES} occurrences), and drafts
 * plain-English rule proposals into `vault/patterns/suggestions.md`. The
 * proposals feed the morning briefing's "What I learned" section.
 *
 * Deterministic — no LLM call. Reading only; the vault write is idempotent
 * (overwrites the suggestions note).
 */
@Injectable()
export class PatternExtractorService {
  private readonly log: ScopedLogger;

  constructor(
    private readonly activity: ActivityLogService,
    private readonly vault: VaultService,
    logger: LoggerService,
  ) {
    this.log = logger.child(PatternExtractorService.name);
  }

  /**
   * Run the extraction: read 30 days of approval activity, tally patterns,
   * write proposals to the vault, return the summary.
   */
  async extract(now: Date = new Date()): Promise<PatternExtractResult> {
    const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const entries = await this.activity.readRange(since, now).catch(() => []);

    const decisions = entries.filter(
      (e) =>
        (e.kind === "approval-approved" || e.kind === "approval-rejected") &&
        e.refs.action &&
        e.refs.decision,
    );

    // Count occurrences of each action+decision combination.
    const tally = new Map<string, ApprovalPattern>();
    for (const entry of decisions) {
      const { action, decision } = entry.refs as { action: string; decision: string };
      const key = `${action}:${decision}`;
      const existing = tally.get(key);
      if (existing) {
        existing.count++;
      } else {
        tally.set(key, { action, decision: decision as "approved" | "rejected", count: 1 });
      }
    }

    const patterns = [...tally.values()]
      .filter((p) => p.count >= MIN_OCCURRENCES)
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_PROPOSALS);

    const proposals = patterns.map((p) => toProposal(p));

    if (proposals.length > 0) {
      await this.writeSuggestions(proposals, now).catch((err) => {
        this.log.warn("failed to write pattern suggestions to vault", {
          error: (err as Error).message,
        });
      });
    }

    this.log.info("pattern extraction complete", {
      decisions: decisions.length,
      patterns: patterns.length,
      proposals: proposals.length,
    });
    return { patterns, proposals };
  }

  /** Read the latest proposals from the vault suggestions note (for briefing). */
  async readProposals(): Promise<string[]> {
    try {
      const note = await this.vault.note("patterns/suggestions");
      return parseProposalsFromNote(note.body ?? "");
    } catch {
      return [];
    }
  }

  private async writeSuggestions(proposals: string[], now: Date): Promise<void> {
    const date = now.toISOString().slice(0, 10);
    const body = [
      `*Updated: ${date}*`,
      "",
      "Recurring approval patterns suggest these could be automatic rules:",
      "",
      ...proposals.map((p) => `- [ ] ${p}`),
      "",
      "_Approve each line to turn it into a gate rule._",
    ].join("\n");

    const noteId = "patterns/suggestions";
    try {
      await this.vault.updateNote(noteId, { body });
    } catch {
      await this.vault.createNote({
        id: noteId,
        title: "Pattern Suggestions",
        tier: "memory",
        body,
      });
    }
  }
}

function toProposal(p: ApprovalPattern): string {
  if (p.decision === "approved") {
    return `Always allow "${p.action}" (approved ${p.count}× in the past 30 days)`;
  }
  return `Always deny "${p.action}" (rejected ${p.count}× in the past 30 days)`;
}

/** Extract bullet lines from the suggestions note body. */
function parseProposalsFromNote(body: string): string[] {
  return body
    .split("\n")
    .filter((l) => l.startsWith("- [ ] ") || l.startsWith("- [x] "))
    .map((l) => l.replace(/^- \[.\] /, "").trim())
    .filter(Boolean);
}
