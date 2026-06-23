import { Injectable } from "@nestjs/common";
import type { Briefing, CreateTaskResult, SearchHit, TaskTarget } from "@zibby/contracts";
import { BriefingService } from "../briefing/briefing.service";
import { VaultService } from "../memory/vault.service";
import { TaskSchedulerService } from "../tasks/task-scheduler.service";

/** Cap on how many memory hits the chat surfaces — signal, not the whole vault. */
const MAX_RECALL_HITS = 5;
/** Cap on how many "needs you" / "watching" lines the status summary lists. */
const MAX_STATUS_LINES = 5;

/**
 * The action surface the chat-first assistant reaches through MCP tool-use: it can
 * DISPATCH work ({@link createTask}), RECALL memory ({@link recallMemory}) and REPORT
 * status ({@link getStatus}). Pure delegation to the existing domain services — kept
 * apart from the SDK/transport wiring (the MCP controller registers the tools and
 * calls these) so the tool LOGIC is unit-testable with mocked services, no model and
 * no transport in the loop.
 */
@Injectable()
export class ChatToolsService {
  constructor(
    private readonly scheduler: TaskSchedulerService,
    private readonly vault: VaultService,
    private readonly briefing: BriefingService,
  ) {}

  /**
   * Dispatch a new work task the operator explicitly asked for (build/fix/run …).
   * Routes through the normal scheduler, so it hits the approval gate exactly like the
   * New Task dialog. Returns a short confirmation naming the chosen target / run.
   */
  async createTask(input: { text: string; paths?: string[] }): Promise<string> {
    const result: CreateTaskResult = await this.scheduler.createTask({
      text: input.text,
      ...(input.paths && input.paths.length > 0 ? { paths: input.paths } : {}),
    });
    if (result.outcome === "scheduled") {
      return `Naplánoval jsem úkol (${result.task.id}) na ${new Date(
        result.task.scheduledAt,
      ).toISOString()}.`;
    }
    const target = describeTarget(result.target);
    return `Spustil jsem úkol (${result.task.id}) — ${target}. Běh: ${result.runRef}.`;
  }

  /** Search the Obsidian vault and return the top few hits compactly (title + snippet). */
  async recallMemory(query: string): Promise<string> {
    const hits: SearchHit[] = await this.vault.search(query);
    if (hits.length === 0) {
      return `V paměti jsem nic k „${query}" nenašel.`;
    }
    const lines = hits
      .slice(0, MAX_RECALL_HITS)
      .map((h) => `- ${h.title} (${h.tier}): ${h.snippet}`);
    return [`Našel jsem v paměti k „${query}":`, ...lines].join("\n");
  }

  /** Summarize what's happening right now — pending decisions + what ZIBBY is watching. */
  async getStatus(): Promise<string> {
    const briefing: Briefing = await this.briefing.assemble();
    return summarizeBriefing(briefing);
  }
}

/** A one-line, human-readable name for a dispatched task's chosen target. */
function describeTarget(target: TaskTarget): string {
  switch (target.kind) {
    case "agent":
      return `agent ${target.name}`;
    case "pipeline":
      return `pipeline ${target.name}`;
    case "goal":
      return `cíl ${target.name}`;
    case "orchestrator":
      return "orchestrátor";
  }
}

/** Render a {@link Briefing} into a compact status report for the chat. */
function summarizeBriefing(b: Briefing): string {
  const parts: string[] = [b.headline];
  if (b.needsYou.length > 0) {
    parts.push(
      `Potřebuje tě (${b.needsYou.length}):`,
      ...b.needsYou.slice(0, MAX_STATUS_LINES).map((n) => `- ${n.summary}`),
    );
  }
  if (b.watching.length > 0) {
    const lines = b.watching
      .slice(0, MAX_STATUS_LINES)
      .map((w) => `- ${w.summary ?? `kanál ${w.integrationId ?? "?"} (${w.newItems ?? 0} nových)`}`);
    parts.push(`Sleduji (${b.watching.length}):`, ...lines);
  }
  if (b.needsYou.length === 0 && b.watching.length === 0) {
    parts.push("Nic teď nepotřebuje tvou pozornost.");
  }
  return parts.join("\n");
}
