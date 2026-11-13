import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { ClaudeRunModule } from "../runner/claude-run.module";
import { AiEnginesService } from "./ai-engines.service";
import { AiProvidersSpendService } from "./ai-providers-spend.service";
import { AiProvidersController } from "./ai-providers.controller";
import { aiProvidersDir } from "./bluecode-provider";
import { AI_PROVIDERS_DIR, AiProvidersStore } from "./ai-providers.store";

@Module({
  // ClaudeRunModule: the claude preflight probe the engines endpoint reports.
  imports: [ApprovalsModule, ClaudeRunModule],
  controllers: [AiProvidersController],
  providers: [
    { provide: AI_PROVIDERS_DIR, useFactory: aiProvidersDir },
    AiProvidersStore,
    AiProvidersSpendService,
    AiEnginesService,
  ],
  exports: [AiProvidersStore],
})
export class AiProvidersModule {}
