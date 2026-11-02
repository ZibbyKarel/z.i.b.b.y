import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AiProvidersSpendService } from "./ai-providers-spend.service";

describe("AiProvidersSpendService", () => {
  let dir: string;
  const prev = process.env.WORKFLOW_RUNS_DIR;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "spend-"));
    process.env.WORKFLOW_RUNS_DIR = dir;
  });
  afterEach(async () => {
    if (prev === undefined) delete process.env.WORKFLOW_RUNS_DIR;
    else process.env.WORKFLOW_RUNS_DIR = prev;
    await fs.rm(dir, { recursive: true, force: true });
  });

  const costs = async (run: string, stage: string, lines: unknown[]) => {
    await fs.mkdir(path.join(dir, run, stage), { recursive: true });
    await fs.writeFile(
      path.join(dir, run, stage, "costs.jsonl"),
      lines.map((l) => JSON.stringify(l)).join("\n") + "\nnot json\n",
    );
  };

  it("sums this month's OpenAI lines across runs and stages, skipping others", async () => {
    const now = new Date("2026-11-15T12:00:00Z");
    await costs("r1", "04-produce", [
      { at: "2026-11-02T10:00:00Z", provider: "openai", costUsd: 0.25 },
      { at: "2026-11-03T10:00:00Z", provider: "openai", costUsd: 0.5 },
      { at: "2026-11-03T10:00:00Z", provider: "mflux", costUsd: 9 },
      { at: "2026-10-30T10:00:00Z", provider: "openai", costUsd: 7 },
    ]);
    await costs("r2", "07-listing", [
      { at: "2026-11-10T10:00:00Z", provider: "openai", costUsd: 0.01 },
    ]);
    expect(await new AiProvidersSpendService().spend(now)).toEqual({
      month: "2026-11",
      openai: { spentUsd: 0.76 },
    });
  });

  it("is zero when there are no runs", async () => {
    await fs.rm(dir, { recursive: true });
    expect((await new AiProvidersSpendService().spend()).openai.spentUsd).toBe(0);
  });
});
