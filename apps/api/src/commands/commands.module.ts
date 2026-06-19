import { Module } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { CommandsController } from "./commands.controller";
import { COMMANDS_DIR, CommandsStorageService } from "./commands.storage.service";

/** Default commands dir, anchored to `apps/api/data/commands` (committed config). */
export function resolveCommandsDir(): string {
  return process.env.COMMANDS_DIR ?? dataDir("commands");
}

/**
 * Custom Claude Code slash commands: a file-backed catalog whose enabled entries
 * the runner materializes into each run's `.claude/commands/`. The storage service
 * is exported so other modules can reuse it; the runner owns its own instance (via
 * {@link ClaudeRunModule}) to stay cycle-free.
 */
@Module({
  controllers: [CommandsController],
  providers: [{ provide: COMMANDS_DIR, useFactory: resolveCommandsDir }, CommandsStorageService],
  exports: [CommandsStorageService],
})
export class CommandsModule {}
