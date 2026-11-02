import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Injectable } from "@nestjs/common";
import type { AiProvidersSpend } from "@zibby/contracts";
import { BUDGET_TZ } from "../budget/ledger.store";
import { dataDir } from "../shared/data-dir";

const monthOf = (d: Date): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUDGET_TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}`;
};

/**
 * Spend per provider this month, summed from the `costs.jsonl` every workflow stage
 * leaves (`<runs>/<run>/<stage>/costs.jsonl`; lines carry `provider` and `at`). OpenAI
 * has no remaining-credit API, so ZIBBY's own spend is all it can show.
 */
@Injectable()
export class AiProvidersSpendService {
  // Same default as `resolveWorkflowRunsDir` (not imported: workflows.module imports this module).
  private readonly runsDir = path.resolve(
    process.env.WORKFLOW_RUNS_DIR ?? process.env.PIPELINE_RUNS_DIR ?? dataDir("workflows", "runs"),
  );

  async spend(now: Date = new Date()): Promise<AiProvidersSpend> {
    const month = monthOf(now);
    let openai = 0;
    const runs = await fs.readdir(this.runsDir).catch(() => [] as string[]);
    for (const run of runs) {
      const stages = await fs.readdir(path.join(this.runsDir, run)).catch(() => [] as string[]);
      for (const stage of stages) {
        const raw = await fs
          .readFile(path.join(this.runsDir, run, stage, "costs.jsonl"), "utf8")
          .catch(() => "");
        for (const line of raw.split("\n")) {
          if (!line.trim()) continue;
          try {
            const c = JSON.parse(line) as { at?: unknown; provider?: unknown; costUsd?: unknown };
            if (
              c.provider === "openai" &&
              typeof c.costUsd === "number" &&
              typeof c.at === "string" &&
              monthOf(new Date(c.at)) === month
            )
              openai += c.costUsd;
          } catch {
            // a malformed line is skipped, as in the runner's own sum
          }
        }
      }
    }
    return { month, openai: { spentUsd: openai } };
  }
}
