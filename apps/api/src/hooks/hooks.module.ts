import { Module } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { HooksController } from "./hooks.controller";
import { HOOKS_DIR, HooksStorageService } from "./hooks.storage.service";

/** Default hooks dir, anchored to `apps/api/data/hooks` (committed config). */
export function resolveHooksDir(): string {
  return process.env.HOOKS_DIR ?? dataDir("hooks");
}

/**
 * Custom Claude Code hooks: a file-backed catalog whose enabled entries the
 * runner merges into every run's `--settings`. The storage service is exported so
 * the {@link ClaudeRunCommandService} can read the catalog when building a run.
 */
@Module({
  controllers: [HooksController],
  providers: [{ provide: HOOKS_DIR, useFactory: resolveHooksDir }, HooksStorageService],
  exports: [HooksStorageService],
})
export class HooksModule {}
