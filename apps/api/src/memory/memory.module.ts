import { Module } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { GroundingService } from "./grounding.service";
import { MemoryController } from "./memory.controller";
import { VAULT_DIR, VaultService } from "./vault.service";

/**
 * Default vault dir, anchored to `apps/api/data/vault`. The dir is committed with
 * seed notes (north-star, a starter MOC); only the episodic `daily/` subdir is
 * gitignored. Real operation points `VAULT_DIR` at the operator's Obsidian vault.
 */
export function resolveVaultDir(): string {
  return process.env.VAULT_DIR ?? dataDir("vault");
}

@Module({
  controllers: [MemoryController],
  providers: [{ provide: VAULT_DIR, useFactory: resolveVaultDir }, VaultService, GroundingService],
  exports: [VaultService, GroundingService],
})
export class MemoryModule {}
