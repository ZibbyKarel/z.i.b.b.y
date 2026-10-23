import { Module } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { QuickActionsController } from "./quick-actions.controller";
import { QUICK_ACTIONS_FILE, QuickActionsStore } from "./quick-actions.store";

export function resolveQuickActionsFile(): string {
  return process.env.QUICK_ACTIONS_FILE ?? dataDir("quick-actions.json");
}

@Module({
  controllers: [QuickActionsController],
  providers: [
    { provide: QUICK_ACTIONS_FILE, useFactory: resolveQuickActionsFile },
    QuickActionsStore,
  ],
})
export class QuickActionsModule {}
