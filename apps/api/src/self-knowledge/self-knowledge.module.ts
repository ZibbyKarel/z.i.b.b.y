import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { GateRulesModule } from "../gate-rules/gate-rules.module";
import { GatesModule } from "../gates/gates.module";
import { MemoryModule } from "../memory/memory.module";
import { PipelinesModule } from "../pipelines/pipelines.module";
import { SelfKnowledgeController } from "./self-knowledge.controller";
import { SelfKnowledgeService } from "./self-knowledge.service";

/**
 * Self-Knowledge (Fáze 1). Reads across four existing resources (agents,
 * pipelines, gate rules + the locked policy floor, the vault) rather than
 * owning any storage of its own — the note it produces is stored as an
 * ordinary vault note via `MemoryModule`'s `VaultService`.
 */
@Module({
  imports: [AgentsModule, PipelinesModule, GateRulesModule, GatesModule, MemoryModule],
  controllers: [SelfKnowledgeController],
  providers: [SelfKnowledgeService],
  exports: [SelfKnowledgeService],
})
export class SelfKnowledgeModule {}
