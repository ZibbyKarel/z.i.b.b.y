import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { SUBSYSTEMS } from "@zibby/contracts";
import { composeSeedNotes } from "./vault-seed.content";
import { VaultService } from "./vault.service";

/**
 * Fresh-install vault seeding (F4c): on boot, if the vault holds ZERO notes
 * (a genuinely empty `VAULT_DIR` — checked via `graph()`, a full scan, not just
 * `index()`'s entry-point-filtered view), write the North Star stub, the root
 * MOC, and all ten subsystem shelves (`composeSeedNotes`). Any NON-empty vault —
 * including this repo's committed `.zibby/data/vault/`, which already carries
 * these notes — is a strict no-op (fresh-install semantics only, never a
 * migration). Registered in `MemoryModule` ONLY: `VaultService`/`VAULT_DIR` are
 * re-provided as independent instances elsewhere (e.g. `ProjectsModule`), and
 * seeding through more than one of them would race the same directory.
 * Per-note write failures are logged and skipped — never fatal to boot (the
 * whole memory loop is fail-open by charter).
 */
@Injectable()
export class VaultSeedService implements OnModuleInit {
  private readonly logger = new Logger(VaultSeedService.name);

  constructor(private readonly vault: VaultService) {}

  async onModuleInit(): Promise<void> {
    try {
      const { nodes } = await this.vault.graph();
      if (nodes.length > 0) {
        this.logger.debug("vault already has notes — seed skipped (fresh-install only)");
        return;
      }
      const seeds = composeSeedNotes(SUBSYSTEMS);
      let written = 0;
      for (const note of seeds) {
        try {
          await this.vault.createNote(note);
          written += 1;
        } catch (error) {
          this.logger.warn(`seed note "${note.id}" failed, continuing: ${String(error)}`);
        }
      }
      this.logger.log(`seeded a fresh vault with ${written}/${seeds.length} notes`);
    } catch (error) {
      this.logger.warn(`vault seed check failed, boot continues: ${String(error)}`);
    }
  }
}
