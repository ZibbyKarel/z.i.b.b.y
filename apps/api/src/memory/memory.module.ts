import { Module } from "@nestjs/common"
import { dataDir } from "../shared/data-dir"
import { MemoryController } from "./memory.controller"
import { VAULT_DIR, VaultService } from "./vault.service"

/** Default vault dir, anchored to `apps/api/data/vault` (gitignored). */
export function resolveVaultDir(): string {
  return process.env.VAULT_DIR ?? dataDir("vault")
}

@Module({
  controllers: [MemoryController],
  providers: [{ provide: VAULT_DIR, useFactory: resolveVaultDir }, VaultService],
  exports: [VaultService],
})
export class MemoryModule {}
