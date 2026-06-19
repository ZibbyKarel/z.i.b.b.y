import { Injectable } from "@nestjs/common";
import { ActivityLogService } from "../activity/activity-log.service";
import { VaultService } from "../memory/vault.service";
import { ResearchConfigStore } from "../research/research-config.store";
import { ResearchService } from "../research/research.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";

/** How many app ideas a pass proposes (the north-star's "weekly 3 app ideas"). */
const MAX_IDEAS = 3;

/** The vault note app-idea suggestions are written to (read by the briefing). */
const NOTE_ID = "suggestions/app-ideas";

export interface AppIdea {
  /** A short pairing headline (interest × trend). */
  title: string;
  /** One sentence on why this pairing is worth a prototype. */
  rationale: string;
}

export interface IdeaResult {
  ideas: AppIdea[];
  suggestions: string[];
}

/**
 * The app-ideas generator (north-star "Proposes — ... app ideas"; M6 weekly bonus).
 * Deterministically pairs the operator's research **interests** with the freshest
 * **trends** from the latest research digest into up to {@link MAX_IDEAS} prototype
 * pitches, written to `vault/suggestions/app-ideas.md` for the morning briefing.
 *
 * Deterministic (no LLM — the same floor as the briefing headline + research ranking);
 * an optional `claude` refinement could slot in later behind the same note. *Proposes
 * ≠ acts*: it only writes a vault note; building an idea is an operator decision.
 */
@Injectable()
export class IdeaGeneratorService {
  private readonly log: ScopedLogger;

  constructor(
    private readonly config: ResearchConfigStore,
    private readonly research: ResearchService,
    private readonly vault: VaultService,
    private readonly activity: ActivityLogService,
    logger: LoggerService,
  ) {
    this.log = logger.child(IdeaGeneratorService.name);
  }

  /** Combine interests × latest-digest trends → app-idea suggestions in the vault. */
  async generate(now: Date = new Date()): Promise<IdeaResult> {
    const [config, digest] = await Promise.all([this.config.read(), this.research.latest(now)]);
    const ideas = pairIdeas(config.interests, digest.items);
    const suggestions = ideas.map((i) => `${i.title} — ${i.rationale}`);

    if (suggestions.length > 0) {
      await this.writeIdeas(suggestions, now).catch((err) => {
        this.log.warn("failed to write app ideas to vault", { error: (err as Error).message });
      });
    }
    void this.activity.record({
      kind: "app-ideas-generated",
      summary: `app ideas — ${ideas.length} proposed`,
      refs: { noteId: NOTE_ID },
    });
    this.log.info("app ideas generated", {
      interests: config.interests.length,
      trends: digest.items.length,
      ideas: ideas.length,
    });
    return { ideas, suggestions };
  }

  /** Read the latest app-idea suggestions from the vault note (for the briefing). */
  async readIdeas(): Promise<string[]> {
    try {
      const note = await this.vault.note(NOTE_ID);
      return parseIdeasFromNote(note.body ?? "");
    } catch {
      return [];
    }
  }

  private async writeIdeas(suggestions: string[], now: Date): Promise<void> {
    const date = now.toISOString().slice(0, 10);
    const body = [
      `*Updated: ${date}*`,
      "",
      "Three things worth prototyping — your interests meet what's trending:",
      "",
      ...suggestions.map((s) => `- [ ] ${s}`),
      "",
      "_A starting point, not a commitment — approve one to spin up a build goal._",
    ].join("\n");
    try {
      await this.vault.updateNote(NOTE_ID, { body });
    } catch {
      await this.vault.createNote({ id: NOTE_ID, title: "App Ideas", tier: "memory", body });
    }
  }
}

/**
 * Pure pairing core: zip the freshest trends with the operator's interests (cycling
 * interests if fewer than trends) into up to {@link MAX_IDEAS} ideas. Empty when there
 * are no interests or no trends — the generator stays quiet rather than inventing noise.
 */
export function pairIdeas(
  interests: string[],
  trends: Array<{ title: string; summary: string }>,
): AppIdea[] {
  if (interests.length === 0 || trends.length === 0) return [];
  const out: AppIdea[] = [];
  for (let i = 0; i < trends.length && out.length < MAX_IDEAS; i++) {
    const trend = trends[i];
    const interest = interests[i % interests.length];
    if (!trend || !interest) continue;
    out.push({
      title: `${interest} × ${shorten(trend.title)}`,
      rationale: `Pair your focus on "${interest}" with "${trend.title}"${trend.summary ? ` — ${trend.summary}` : ""}`,
    });
  }
  return out;
}

function shorten(text: string): string {
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

/** Extract the `- [ ] …` / `- [x] …` bullet lines from the app-ideas note body. */
function parseIdeasFromNote(body: string): string[] {
  return body
    .split("\n")
    .filter((l) => l.startsWith("- [ ] ") || l.startsWith("- [x] "))
    .map((l) => l.replace(/^- \[.\] /, "").trim())
    .filter(Boolean);
}
