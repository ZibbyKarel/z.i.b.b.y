import { Inject, Injectable } from "@nestjs/common";
import {
  AGENT_ID_REGEX,
  type Automation,
  AutomationSchema,
  type CreateAutomationInput,
  type UpdateAutomationInput,
} from "@zibby/contracts";
import { EntityFileStore, searchByText } from "../shared/file-storage";

export const AUTOMATIONS_DIR = "AUTOMATIONS_DIR";

export class AutomationNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Automation "${id}" not found`);
    this.name = "AutomationNotFoundError";
  }
}
export class AutomationConflictError extends Error {
  constructor(public readonly id: string) {
    super(`Automation "${id}" already exists`);
    this.name = "AutomationConflictError";
  }
}
export class InvalidAutomationIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid automation id: "${id}"`);
    this.name = "InvalidAutomationIdError";
  }
}
/** A system automation is seeded by ZIBBY: it can't be deleted, and only its
 *  schedule (`trigger`) and `enabled` state may be edited. Both routes surface
 *  this as a 409. */
export class SystemAutomationError extends Error {
  constructor(public readonly id: string) {
    super(
      `Automation "${id}" is a system automation — it cannot be deleted, only rescheduled or toggled`,
    );
    this.name = "SystemAutomationError";
  }
}

/** Stable id of the nightly memory-distillation system automation. */
export const MEMORY_DISTILL_AUTOMATION_ID = "memory-distill";
/** Stable id of the nightly self-knowledge-refresh system automation (F4c). */
export const SELF_KNOWLEDGE_AUTOMATION_ID = "self-knowledge-refresh";

/**
 * System automations ZIBBY owns and seeds on boot. They embody capabilities that
 * are the *system's*, not an agent's or the operator's — so they can't be deleted,
 * only rescheduled. Memory distillation is the canonical one: agents stay
 * memory-blind, and learning-from-runs runs here as infrastructure. (Phase 116a:
 * `discovery`/`research-digest`/`app-ideas` were retired — the operator now
 * targets the `code-audit`/`research` pipelines directly for that work instead.)
 */
export const SYSTEM_AUTOMATIONS: readonly Automation[] = [
  {
    id: "morning-briefing",
    name: "Ranní briefing",
    trigger: { type: "cron", expr: "0 7 * * *" },
    target: { type: "briefing" },
    enabled: true,
    system: true,
  },
  {
    id: MEMORY_DISTILL_AUTOMATION_ID,
    name: "Destilace paměti",
    trigger: { type: "cron", expr: "0 3 * * *" },
    target: { type: "memory-distill" },
    enabled: true,
    system: true,
  },
  {
    id: "nightly-patterns",
    name: "Extrakce vzorů",
    trigger: { type: "cron", expr: "0 23 * * *" },
    target: { type: "pattern-extract" },
    enabled: true,
    system: true,
  },
  {
    id: "gap-detect",
    name: "Návrhy na automatizaci",
    trigger: { type: "cron", expr: "0 23 * * *" },
    target: { type: "gap-detect" },
    enabled: false,
    system: true,
  },
  {
    id: "agent-factory",
    name: "Továrna agentů",
    trigger: { type: "cron", expr: "0 4 * * 1" },
    target: { type: "agent-factory" },
    enabled: false,
    system: true,
  },
  {
    id: SELF_KNOWLEDGE_AUTOMATION_ID,
    name: "Obnova sebeznalosti",
    // 3:30 — after the 3:00 distill, before the 7:00 briefing.
    trigger: { type: "cron", expr: "30 3 * * *" },
    target: { type: "self-knowledge" },
    enabled: true,
    system: true,
  },
];

/** Durable, file-backed persistence for automations — one `<id>.json` each. */
@Injectable()
export class AutomationsStorageService extends EntityFileStore<Automation> {
  protected readonly fileExt = ".json";
  protected readonly idRegex = AGENT_ID_REGEX;

  constructor(@Inject(AUTOMATIONS_DIR) dir: string) {
    super(dir);
  }

  async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    await this.seedSystem();
  }

  /**
   * Ensure every system automation exists, self-healing on each boot: create the
   * ones missing, and re-assert the server-owned fields (`system`, `target`, `name`)
   * on the ones present — while preserving the operator's `trigger`, `enabled` and
   * `lastFiredAt` from disk (those are theirs to keep across restarts).
   */
  private async seedSystem(): Promise<void> {
    for (const def of SYSTEM_AUTOMATIONS) {
      let existing: Automation | null = null;
      try {
        existing = await this.get(def.id);
      } catch (error) {
        if (!(error instanceof AutomationNotFoundError)) throw error;
      }
      if (!existing) {
        await this.writeEntity({ ...def });
        continue;
      }
      const healed: Automation = { ...existing, name: def.name, target: def.target, system: true };
      if (this.serialize(existing) !== this.serialize(healed)) await this.writeEntity(healed);
    }
  }

  async create(input: CreateAutomationInput): Promise<Automation> {
    const file = this.resolveFile(input.id);
    if (await this.fileExists(file)) throw new AutomationConflictError(input.id);
    // `system` is server-owned — never settable through create.
    const automation: Automation = { ...input, system: false };
    await this.writeEntity(automation);
    return automation;
  }

  async update(id: string, patch: UpdateAutomationInput): Promise<Automation> {
    return this.updateEntity(id, (existing) => {
      // System automations allow only a reschedule or an enable/disable toggle —
      // any change to `target`/`name`/`prompt` etc. is refused.
      if (existing.system) {
        const touchesLockedField = Object.entries(patch).some(
          ([key, value]) => key !== "trigger" && key !== "enabled" && value !== undefined,
        );
        if (touchesLockedField) throw new SystemAutomationError(id);
      }
      return { ...existing, ...patch, id: existing.id, system: existing.system };
    });
  }

  /** Refuse to delete a system automation (it is rescheduling-only). */
  override async delete(id: string): Promise<void> {
    const existing = await this.get(id);
    if (existing.system) throw new SystemAutomationError(id);
    await super.delete(id);
  }

  /** Free-text search over automations by id and name. */
  async search(query: string): Promise<Automation[]> {
    return searchByText(await this.list(), query, (a) => [a.id, a.name]);
  }

  /** Stamp the last-fired time (idempotence + display); separate from user updates. */
  async markFired(id: string, at: string): Promise<Automation> {
    return this.updateEntity(id, (existing) => ({ ...existing, lastFiredAt: at }));
  }

  protected idOf(automation: Automation): string {
    return automation.id;
  }

  protected serialize(automation: Automation): string {
    return JSON.stringify(automation);
  }

  protected tryParse(raw: string): Automation | null {
    return this.parseJson(AutomationSchema, raw);
  }

  protected compare(a: Automation, b: Automation): number {
    return a.id.localeCompare(b.id);
  }

  protected notFound(id: string): Error {
    return new AutomationNotFoundError(id);
  }

  protected invalidId(id: string): Error {
    return new InvalidAutomationIdError(id);
  }
}
