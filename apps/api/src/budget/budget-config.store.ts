import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { type GlobalBudget, GlobalBudgetSchema } from "@zibby/contracts";
import { ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage";

/** DI token carrying the absolute path of the global budget config file. */
export const BUDGET_CONFIG_FILE = "BUDGET_CONFIG_FILE";

/**
 * The operator-owned global ceiling, persisted as a single `data/budget.json`
 * (committed in the repo, hand-/Settings-edited) — same posture as `mandate.json`.
 * A missing or garbage file reads as `{}` (no global pause): the budget guard then
 * only enforces per-project caps. Writes are atomic (temp + rename).
 */
@Injectable()
export class BudgetConfigStore {
  private readonly dir: string;

  constructor(@Inject(BUDGET_CONFIG_FILE) private readonly file: string) {
    this.dir = path.dirname(file);
  }

  /** Read the config; a missing/garbage file → empty config (no global pause). */
  async read(): Promise<GlobalBudget> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null);
    if (raw === null) return {};
    const parsed = GlobalBudgetSchema.safeParse(safeJson(raw));
    return parsed.success ? parsed.data : {};
  }

  /** Replace the config (validated by the contract schema upstream). */
  async write(config: GlobalBudget): Promise<GlobalBudget> {
    const next = GlobalBudgetSchema.parse(config);
    await ensureDir(this.dir);
    await writeFileAtomic(this.file, `${JSON.stringify(next, null, 2)}\n`);
    return next;
  }
}
