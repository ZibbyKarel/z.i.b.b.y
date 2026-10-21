import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, type OnModuleInit, Optional } from "@nestjs/common";
import { DecisionSchema, type GateRule } from "@zibby/contracts";
import matter from "gray-matter";
import { GateRulesStorageService } from "../gate-rules/gate-rules.storage.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";

/** DI token for the directory that may still hold a legacy `POLICY.md` to migrate. */
export const POLICY_DIR = "POLICY_DIR";

const FILE = "POLICY.md";

/**
 * The global rule bucket the gate evaluator calls "the floor": every untagged rule
 * of the gate-rules list (the built-in system rules + the operator's own), served
 * as locked `source: "system"` `GateRule`s. Agents can only tighten it (the
 * evaluator takes the strictest bucket); only the operator edits it, on the gates
 * board. Department-tagged rules are not part of it — they form their own bucket.
 */
@Injectable()
export class PolicyStorageService implements OnModuleInit {
  private readonly log?: ScopedLogger;

  constructor(
    private readonly catalog: GateRulesStorageService,
    // Optional so unit tests can `new PolicyStorageService(catalog)` with no legacy file.
    @Optional() @Inject(POLICY_DIR) private readonly legacyDir?: string,
    @Optional() logger?: LoggerService,
  ) {
    this.log = logger?.child(PolicyStorageService.name);
  }

  /**
   * One-shot migration of the legacy `POLICY.md` floor: its operator `decisions`
   * overrides (a floor rule moved to another column) are applied to the matching
   * system rules, then the file is renamed to `POLICY.md.migrated`.
   * ponytail: only `decisions` carry over — hand-added `policy` entries don't; add
   * them on the board if a POLICY.md ever had any.
   */
  async onModuleInit(): Promise<void> {
    if (!this.legacyDir) return;
    const file = path.join(path.resolve(this.legacyDir), FILE);
    const raw = await fs.readFile(file, "utf8").catch(() => null);
    if (raw === null) return;
    let data: Record<string, unknown> = {};
    try {
      data = matter(raw).data as Record<string, unknown>;
    } catch {
      // unparsable legacy file: nothing to carry over.
    }
    const decisions =
      data.decisions && typeof data.decisions === "object" ? Object.entries(data.decisions) : [];
    const rules = await this.catalog.list();
    for (const [id, value] of decisions) {
      const decision = DecisionSchema.safeParse(value);
      const rule = rules.find((r) => r.id === id);
      if (!decision.success || !rule) continue;
      const base = { name: rule.name, desc: rule.desc, match: rule.match };
      await this.catalog.update(
        id,
        decision.data === "ask"
          ? { ...base, decision: decision.data, resolve: rule.resolve ?? { type: "human" } }
          : { ...base, decision: decision.data },
      );
    }
    await fs.rename(file, `${file}.migrated`);
    this.log?.info("migrated legacy POLICY.md into gate-rules.json", {
      decisions: decisions.length,
    });
  }

  /** The global rules (untagged), in list order, as locked floor-bucket `GateRule`s. */
  async floor(): Promise<GateRule[]> {
    return (await this.catalog.list())
      .filter((r) => !r.department)
      .map((r) => ({
        id: r.id,
        source: "system",
        locked: true,
        match: r.match,
        decision: r.decision,
        ...(r.resolve ? { resolve: r.resolve } : {}),
      }));
  }
}
