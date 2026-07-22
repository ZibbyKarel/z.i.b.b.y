import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { type HandoffRule, HandoffRuleSchema } from "@zibby/contracts";
import { z } from "zod";
import { ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";

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
 * Read + seed only for v1: CRUD is deferred to the Part-2 rule-editor UI, so
 * there is no `create`/`update`/`delete` here on purpose.
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
   * Missing file, or one that fails to parse as a valid rule array, is (re)seeded
   * with the system defaults. A present, valid file is left untouched — v1 has no
   * write path other than this seed, so "valid" only ever means "still the last
   * seed" today, but the check is written generically for when Part-2 CRUD lands.
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
