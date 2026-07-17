import { Injectable } from "@nestjs/common";
import type {
  Briefing,
  CreateTaskResult,
  SubsystemId,
  SubsystemState,
  SubsystemWithStatus,
  TaskTarget,
} from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { BriefingService } from "../briefing/briefing.service";
import { MachineActionRejectedError, MachineService } from "../machine/machine.service";
import { recallMemory as recallMemoryFromVault } from "../memory/recall.helper";
import { VaultService } from "../memory/vault.service";
import { SubsystemsService } from "../subsystems/subsystems.service";
import { TaskSchedulerService } from "../tasks/task-scheduler.service";
import type { ChatCreateTaskMeta } from "./chat-tool-result.registry";

/** `createTask`'s return: the Czech confirmation the model sees, plus the structured
 * data (when a run was actually dispatched) the MCP controller queues into the
 * {@link ChatCreateTaskMeta} registry for `chat-session.service#describeTool`. */
export interface ChatCreateTaskOutcome {
  text: string;
  meta?: ChatCreateTaskMeta;
}

/** Cap on how many "needs you" / "watching" lines the status summary lists. */
const MAX_STATUS_LINES = 5;

/** Cap on how many recent owner-tagged activity lines the per-subsystem status lists. */
const MAX_SUBSYSTEM_ACTIVITY_LINES = 3;

/** NS2 F3c — the Czech state phrase for a per-subsystem status answer. */
const SUBSYSTEM_STATE_LABEL: Record<SubsystemState, string> = {
  idle: "v klidu",
  running: "právě pracuje",
  report: "má nové reporty",
  waiting: "čeká na tvé rozhodnutí",
};

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
    private readonly machine: MachineService,
    // NS2 F3c — the per-subsystem `get_status` lens (SubsystemsModule import;
    // ActivityLogService comes from the @Global activity module).
    private readonly subsystems: SubsystemsService,
    private readonly activity: ActivityLogService,
  ) {}

  /**
   * Dispatch a new work task the operator explicitly asked for (build/fix/run …).
   * Routes through the normal scheduler, so it hits the approval gate exactly like the
   * New Task dialog. Returns a short confirmation naming the chosen target / run, plus
   * (when a run was actually dispatched) the structured `meta` the MCP controller
   * queues for `chat-session.service#describeTool` to enrich the tool event with.
   *
   * `explicitTarget` (Fáze 14.2, the @mention picker) is passed straight through to
   * the scheduler — "explicit target overrides the classifier" — and, when used, gets
   * a short note appended to the confirmation so the model knows routing was explicit.
   */
  async createTask(input: {
    text: string;
    paths?: string[];
    explicitTarget?: TaskTarget;
  }): Promise<ChatCreateTaskOutcome> {
    const result: CreateTaskResult = await this.scheduler.createTask(
      {
        text: input.text,
        ...(input.paths && input.paths.length > 0 ? { paths: input.paths } : {}),
      },
      undefined,
      undefined,
      input.explicitTarget,
    );
    if (result.outcome === "scheduled") {
      return {
        text: `Naplánoval jsem úkol (${result.task.id}) na ${new Date(
          result.task.scheduledAt,
        ).toISOString()}.`,
      };
    }
    // The chat tool calls the scheduler synchronously (no `background`), so it always
    // gets `dispatched`/`scheduled` — never the dialog's `pending`. Guard it anyway so
    // the union stays exhaustive.
    if (result.outcome === "pending") {
      return { text: `Spustil jsem úkol (${result.task.id}) — připravuje se na pozadí.` };
    }
    const target = describeTarget(result.target);
    const explicitNote = input.explicitTarget
      ? ` Oslovil jsi přímo ${target}, klasifikátor jsem tedy přeskočil.`
      : "";
    return {
      text: `Spustil jsem úkol (${result.task.id}) — ${target}. Běh: ${result.runRef}.${explicitNote}`,
      meta: { runRef: result.runRef, taskId: result.task.id, target: result.target },
    };
  }

  /** Search the Obsidian vault and return the top few hits compactly (title + snippet). */
  async recallMemory(query: string): Promise<string> {
    return recallMemoryFromVault(this.vault, query);
  }

  /**
   * Summarize what's happening right now — pending decisions + what ZIBBY is
   * watching. NS2 F3c: with a `subsystem` argument ("co dělá Forge?") the answer
   * narrows to that one subsystem — its live state, tier counts, and the most
   * recent owner-tagged activity lines; without one, the global briefing summary
   * is unchanged.
   */
  async getStatus(subsystem?: SubsystemId): Promise<string> {
    if (subsystem) return this.subsystemStatus(subsystem);
    const briefing: Briefing = await this.briefing.assemble();
    return summarizeBriefing(briefing);
  }

  /** The per-subsystem Czech status answer: state + counts + recent owned activity. */
  private async subsystemStatus(id: SubsystemId): Promise<string> {
    const row: SubsystemWithStatus = await this.subsystems.get(id);
    const parts: string[] = [`${row.name} — ${SUBSYSTEM_STATE_LABEL[row.state]}.`];
    if (row.tier3Count > 0) {
      parts.push(`Čeká na tebe: ${row.tier3Count} (rozhodnutí ve frontě schválení).`);
    }
    if (row.tier2Count > 0) {
      parts.push(`K reportu od tvé poslední návštěvy: ${row.tier2Count}.`);
    }
    if (row.tier3Count === 0 && row.tier2Count === 0) {
      parts.push("Nic z něj teď nečeká na tvou pozornost.");
    }
    // Recent owner-tagged activity (F2c's `refs.ownerSubsystem`), best-effort —
    // a failed read degrades to no activity lines, never a failed answer.
    const recent = await this.activity.list({ limit: 50 }).catch(() => []);
    const owned = recent
      .filter((e) => e.refs.ownerSubsystem === id)
      .slice(0, MAX_SUBSYSTEM_ACTIVITY_LINES);
    if (owned.length > 0) {
      parts.push("Poslední aktivita:", ...owned.map((e) => `- ${e.summary}`));
    }
    return parts.join("\n");
  }

  /**
   * N5b: park a rename-files machine action behind the gate. Safe to expose to
   * chat — propose NEVER executes; the operator's approve in the queue does. A
   * refused guard (bad folder, collision, …) comes back as the message, not a crash.
   */
  async proposeRename(input: { folder: string; find: string; replace: string }): Promise<string> {
    try {
      const record = await this.machine.propose({ kind: "rename-files", ...input });
      return (
        `Připravil jsem přejmenování ${record.preview.length} souborů v ${input.folder} ` +
        `(„${input.find}" → „${input.replace}") — čeká na tvé schválení ve frontě.`
      );
    } catch (err) {
      if (err instanceof MachineActionRejectedError) return `Návrh jsem odmítl: ${err.message}`;
      throw err;
    }
  }

  /** N5b: park an open-Maps lookup behind the gate (opens a window only — still gated). */
  async proposeOpenMaps(query: string): Promise<string> {
    try {
      await this.machine.propose({ kind: "open-maps", query });
      return `Připravil jsem otevření Map s hledáním „${query}" — čeká na tvé schválení ve frontě.`;
    } catch (err) {
      if (err instanceof MachineActionRejectedError) return `Návrh jsem odmítl: ${err.message}`;
      throw err;
    }
  }

  /**
   * N5c: park opening a folder in the operator's file manager behind the gate
   * (opens a window only — still gated, still fail-closed on a bad path).
   */
  async proposeOpenFolder(path: string): Promise<string> {
    try {
      await this.machine.propose({ kind: "open-folder", path });
      return `Připravil jsem otevření složky ${path} — čeká na tvé schválení ve frontě.`;
    } catch (err) {
      if (err instanceof MachineActionRejectedError) return `Návrh jsem odmítl: ${err.message}`;
      throw err;
    }
  }
}

/**
 * A one-line, human-readable name for a dispatched task's chosen target. Exported
 * so `chat-session.service` can reuse the same wording — for the tool event's
 * summary (`target` known) and for the explicit-target line added to the turn's
 * system prompt.
 */
export function describeTarget(target: TaskTarget): string {
  switch (target.kind) {
    case "agent":
      return `agent ${target.name}`;
    case "pipeline":
      return `pipeline ${target.name}`;
    case "goal":
      return `cíl ${target.name}`;
    case "chain":
      return `řetězec ${target.name}`;
    case "subsystem":
      return `podsystém ${target.name}`;
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
      .map(
        (w) => `- ${w.summary ?? `kanál ${w.integrationId ?? "?"} (${w.newItems ?? 0} nových)`}`,
      );
    parts.push(`Sleduji (${b.watching.length}):`, ...lines);
  }
  if (b.needsYou.length === 0 && b.watching.length === 0) {
    parts.push("Nic teď nepotřebuje tvou pozornost.");
  }
  return parts.join("\n");
}
