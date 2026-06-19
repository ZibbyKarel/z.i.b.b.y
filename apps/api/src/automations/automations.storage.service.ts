import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import {
  AGENT_ID_REGEX,
  type Automation,
  AutomationSchema,
  type CreateAutomationInput,
  type UpdateAutomationInput,
} from "@zibby/contracts";
import { EntityFileStore, safeJson, searchByText } from "../shared/file-storage";

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
 *  schedule (`trigger`) may be edited. Both routes surface this as a 409. */
export class SystemAutomationError extends Error {
  constructor(public readonly id: string) {
    super(`Automation "${id}" is a system automation — it cannot be deleted, only rescheduled`);
    this.name = "SystemAutomationError";
  }
}

/** Stable id of the nightly memory-distillation system automation. */
export const MEMORY_DISTILL_AUTOMATION_ID = "memory-distill";

/**
 * System automations ZIBBY owns and seeds on boot. They embody capabilities that
 * are the *system's*, not an agent's or the operator's — so they can't be deleted,
 * only rescheduled. Memory distillation is the canonical one: agents stay
 * memory-blind, and learning-from-runs runs here as infrastructure.
 */
export const SYSTEM_AUTOMATIONS: readonly Automation[] = [
  {
    id: MEMORY_DISTILL_AUTOMATION_ID,
    name: "Destilace paměti",
    trigger: { type: "cron", expr: "0 3 * * *" },
    target: { type: "memory-distill" },
    enabled: true,
    system: true,
  },
];

/** Durable, file-backed persistence for automations — one `<id>.json` each. */
@Injectable()
export class AutomationsStorageService extends EntityFileStore<Automation> implements OnModuleInit {
  protected readonly fileExt = ".json";
  protected readonly idRegex = AGENT_ID_REGEX;

  constructor(@Inject(AUTOMATIONS_DIR) dir: string) {
    super(dir);
  }

  async onModuleInit(): Promise<void> {
    await this.ensureDir();
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
    const existing = await this.get(id);
    // System automations are rescheduling-only: any non-`trigger` change is refused.
    if (existing.system) {
      const touchesNonSchedule = Object.entries(patch).some(
        ([key, value]) => key !== "trigger" && value !== undefined,
      );
      if (touchesNonSchedule) throw new SystemAutomationError(id);
    }
    const merged: Automation = { ...existing, ...patch, id: existing.id, system: existing.system };
    await this.writeEntity(merged);
    return merged;
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
    const existing = await this.get(id);
    const merged: Automation = { ...existing, lastFiredAt: at };
    await this.writeEntity(merged);
    return merged;
  }

  protected idOf(automation: Automation): string {
    return automation.id;
  }

  protected serialize(automation: Automation): string {
    return JSON.stringify(automation);
  }

  protected tryParse(raw: string): Automation | null {
    const parsed = AutomationSchema.safeParse(safeJson(raw));
    return parsed.success ? parsed.data : null;
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
