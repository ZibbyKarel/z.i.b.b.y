import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { type HandoffRule, type HandoffRuleInput, HandoffRuleSchema } from "@zibby/contracts";
import { z } from "zod";
import { collisionResistantId, ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { HandoffRuleNotFoundError, SystemHandoffRuleError } from "./handoff-rule.errors";

/** DI token for the single rules JSON file. */
export const HANDOFF_RULES_FILE = "HANDOFF_RULES_FILE";

const RuleListSchema = z.array(HandoffRuleSchema);

/**
 * The A.3 seed table (design doc
 * `docs/superpowers/specs/2026-07-22-subsystem-handoff-design.md`, Part A.3):
 * migrates today's hard-coded Sentinel critical-CVE and Maestro post-merge-red
 * dispatch behavior into rule-driven Tier-2s, and adds the operator's new
 * Loom→Forge and Scout→Forge asks as Tier-3 (propose, don't act). All four are
 * `system: true` — the operator retunes them once the Part-2 rule-editor UI ships.
 */
export const SYSTEM_HANDOFF_RULES: readonly HandoffRule[] = [
  {
    id: "sentinel-cve-critical",
    from: "sentinel",
    signalKind: "cve",
    minSeverity: "critical",
    to: { kind: "subsystem", id: "forge" },
    tier: 2,
    enabled: true,
    system: true,
  },
  {
    id: "maestro-post-merge-red",
    from: "maestro",
    signalKind: "post-merge-red",
    to: { kind: "subsystem", id: "forge" },
    tier: 2,
    enabled: true,
    system: true,
  },
  {
    id: "loom-architecture",
    from: "loom",
    signalKind: "*",
    to: { kind: "subsystem", id: "forge" },
    tier: 3,
    enabled: true,
    system: true,
  },
  {
    id: "scout-research",
    from: "scout",
    signalKind: "research-artifact",
    to: { kind: "subsystem", id: "forge" },
    tier: 3,
    enabled: true,
    system: true,
  },
] as const;

/**
 * A2 — the standing handoff rule set (design doc Part A.2): a single file-backed
 * JSON array (`.zibby/data/handoff/rules.json`), unlike the per-record
 * `AutomationsStorageService` this is modeled on — a handful of rules doesn't
 * need one file each, so it's a single list, like `HeraldGraduationStore`'s
 * `graduations.json`. Seeded with {@link SYSTEM_HANDOFF_RULES} on first boot;
 * a missing OR corrupt file re-seeds the defaults (fail-open — never throws).
 * P1 — full CRUD has landed (the Part-2 rule-editor UI's backend): `create`
 * mints an id and always forces `system: false` (an operator rule is never a
 * system rule regardless of what the input carries); `update` preserves the
 * stored `system` flag verbatim (a system rule can be retuned but never demoted,
 * a user rule can never be promoted); `delete` refuses a system rule with
 * {@link SystemHandoffRuleError}. Seed/fail-open semantics of `list`/`seedSystem`
 * are untouched.
 */
@Injectable()
export class HandoffRuleStore implements OnModuleInit {
  private readonly file: string;
  private readonly log: ScopedLogger;

  constructor(@Inject(HANDOFF_RULES_FILE) file: string, logger: LoggerService) {
    this.file = path.resolve(file);
    this.log = logger.child(HandoffRuleStore.name);
  }

  async onModuleInit(): Promise<void> {
    await this.seedSystem();
  }

  /** All rules (system + future operator-authored), in on-disk order. */
  async list(): Promise<HandoffRule[]> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null);
    if (raw === null) return [];
    const parsed = RuleListSchema.safeParse(safeJson(raw));
    if (!parsed.success) {
      this.log.warn("corrupt handoff rules file — treating as empty (fail-open)");
      return [];
    }
    return parsed.data;
  }

  /**
   * Append a new operator-authored rule. `system` is ALWAYS forced to `false` here
   * — an operator create is never a system rule, regardless of what the input carries.
   */
  async create(input: HandoffRuleInput): Promise<HandoffRule> {
    const rules = await this.list();
    const rule: HandoffRule = { ...input, id: collisionResistantId("hrule"), system: false };
    await this.write([...rules, rule]);
    return rule;
  }

  /**
   * Replace a rule's editable fields in place (keeps its id). The stored `system`
   * flag is PRESERVED from the existing rule and can never be changed by the input
   * — a system rule stays system (retune only), a user rule stays user.
   */
  async update(id: string, input: HandoffRuleInput): Promise<HandoffRule> {
    const rules = await this.list();
    const index = rules.findIndex((r) => r.id === id);
    if (index === -1) throw new HandoffRuleNotFoundError(id);
    const existing = rules[index];
    if (!existing) throw new HandoffRuleNotFoundError(id);
    const updated: HandoffRule = { ...input, id, system: existing.system ?? false };
    const next = [...rules];
    next[index] = updated;
    await this.write(next);
    return updated;
  }

  /** Remove an operator-authored rule. A system rule throws {@link SystemHandoffRuleError}. */
  async delete(id: string): Promise<void> {
    const rules = await this.list();
    const existing = rules.find((r) => r.id === id);
    if (!existing) throw new HandoffRuleNotFoundError(id);
    if (existing.system === true) throw new SystemHandoffRuleError(id);
    await this.write(rules.filter((r) => r.id !== id));
  }

  /**
   * Missing file, or one that fails to parse as a valid rule array, is (re)seeded
   * with the system defaults. A present, valid file is left untouched — once
   * `create`/`update`/`delete` have run, "valid" means "whatever the operator's
   * CRUD has left on disk", not "still the last seed"; this only ever fires on a
   * fresh/corrupt file, never clobbering live edits.
   */
  private async seedSystem(): Promise<void> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null);
    if (raw !== null && RuleListSchema.safeParse(safeJson(raw)).success) return;
    if (raw !== null) this.log.warn("corrupt handoff rules file — reseeding system defaults");
    await this.write([...SYSTEM_HANDOFF_RULES]);
  }

  private async write(rules: HandoffRule[]): Promise<void> {
    await ensureDir(path.dirname(this.file));
    await writeFileAtomic(this.file, `${JSON.stringify(rules, null, 2)}\n`);
  }
}
