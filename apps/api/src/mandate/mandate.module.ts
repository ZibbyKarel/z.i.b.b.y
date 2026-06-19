import { Module } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { MandateController } from "./mandate.controller";
import { MANDATE_FILE, MandateStorageService } from "./mandate.storage.service";

/** Default mandate file, anchored to `apps/api/data/mandate.json`. */
export function resolveMandateFile(): string {
  return process.env.MANDATE_FILE ?? dataDir("mandate.json");
}

/**
 * The autonomy mandate (Phase 5.3) — a single operator-owned document in the
 * gates' neighborhood. Exported so the channel triage flow can read it to decide
 * whether a tier may dispatch / reply unprompted.
 */
@Module({
  controllers: [MandateController],
  providers: [{ provide: MANDATE_FILE, useFactory: resolveMandateFile }, MandateStorageService],
  exports: [MandateStorageService],
})
export class MandateModule {}
