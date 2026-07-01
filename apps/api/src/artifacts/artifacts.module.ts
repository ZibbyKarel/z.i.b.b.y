import { Module } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { ArtifactsController } from "./artifacts.controller";
import { ARTIFACTS_DIR, ArtifactsStorageService } from "./artifacts.storage.service";

/** Default artifacts dir, anchored to the data root (`ZIBBY_DATA_DIR/artifacts`). */
export function resolveArtifactsDir(): string {
  return process.env.ARTIFACTS_DIR ?? dataDir("artifacts");
}

/**
 * The durable artifact registry (N2a). The storage service is exported so the
 * pipeline runner (and later the N2b chain runner) records deliveries; the
 * controller serves the read-only registry.
 */
@Module({
  controllers: [ArtifactsController],
  providers: [
    { provide: ARTIFACTS_DIR, useFactory: resolveArtifactsDir },
    ArtifactsStorageService,
  ],
  exports: [ArtifactsStorageService],
})
export class ArtifactsModule {}
