import { Module } from "@nestjs/common";
import * as path from "node:path";
import { AgentsModule } from "../agents/agents.module";
import { GateRulesModule } from "../gate-rules/gate-rules.module";
import { GatesModule } from "../gates/gates.module";
import { MemoryModule } from "../memory/memory.module";
import { PipelinesModule } from "../pipelines/pipelines.module";
import { GRAPH_REPORT_PATH, SelfKnowledgeService } from "./self-knowledge.service";
import { SelfKnowledgeController } from "./self-knowledge.controller";

/**
 * Default absolute path to graphify's `graphify-out/GRAPH_REPORT.md` (Fáze 10 —
 * see `docs/plans/phase-10-graphify-self-knowledge.md`). Anchored to the repo
 * root via THIS file's location (`apps/api/src/self-knowledge/` → four `..`
 * segments up), not `process.cwd()` — mirrors `resolveDataRoot()`'s reasoning
 * (`../shared/data-dir.ts`) and solves the same cwd problem `generate-cli.ts`'s
 * `pinRelativeDataDir` documents: the dev server runs with cwd `apps/api`, the
 * CLI runs via `pnpm --filter @zibby/api exec` (also cwd `apps/api`), and the
 * vitest runner's cwd is the repo root — all three must agree on one file.
 * `graphify-out/` is entirely gitignored (never committed — see the plan's
 * "Rozhodnutí" section), so this path routinely does not exist; the service
 * treats that as "codebase shape not available" rather than an error.
 */
export function resolveGraphReportPath(): string {
  return (
    process.env.GRAPH_REPORT_PATH ??
    path.resolve(__dirname, "..", "..", "..", "..", "graphify-out", "GRAPH_REPORT.md")
  );
}

/**
 * Self-Knowledge (Fáze 1, extended in Fáze 10). Reads across four existing
 * resources (agents, pipelines, gate rules + the locked policy floor, the
 * vault) rather than owning any storage of its own — the note it produces is
 * stored as an ordinary vault note via `MemoryModule`'s `VaultService`. Fáze 10
 * adds a sixth input read straight off disk: graphify's `GRAPH_REPORT.md`.
 */
@Module({
  imports: [AgentsModule, PipelinesModule, GateRulesModule, GatesModule, MemoryModule],
  controllers: [SelfKnowledgeController],
  providers: [{ provide: GRAPH_REPORT_PATH, useFactory: resolveGraphReportPath }, SelfKnowledgeService],
  exports: [SelfKnowledgeService],
})
export class SelfKnowledgeModule {}
