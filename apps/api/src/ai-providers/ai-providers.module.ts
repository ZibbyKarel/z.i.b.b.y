import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { dataDir } from "../shared/data-dir";
import { AiProvidersSpendService } from "./ai-providers-spend.service";
import { AiProvidersController } from "./ai-providers.controller";
import { AI_PROVIDERS_DIR, AiProvidersStore } from "./ai-providers.store";

/** Default dir, anchored to `.zibby/data/ai-providers` (gitignored). */
export function resolveAiProvidersDir(): string {
  return process.env.AI_PROVIDERS_DIR ?? dataDir("ai-providers");
}

@Module({
  imports: [ApprovalsModule],
  controllers: [AiProvidersController],
  providers: [
    { provide: AI_PROVIDERS_DIR, useFactory: resolveAiProvidersDir },
    AiProvidersStore,
    AiProvidersSpendService,
  ],
  exports: [AiProvidersStore],
})
export class AiProvidersModule {}
