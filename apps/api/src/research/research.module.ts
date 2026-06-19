import { Module } from "@nestjs/common";
import { MemoryModule } from "../memory/memory.module";
import { dataDir } from "../shared/data-dir";
import { FakeResearchAdapter, RESEARCH_FIXTURES_DIR } from "./fake.adapter";
import { RESEARCH_CONFIG_FILE, ResearchConfigStore } from "./research-config.store";
import { ResearchController } from "./research.controller";
import { RESEARCH_DIGEST_FILE, ResearchService } from "./research.service";

/** Default config file, anchored to `apps/api/data/research-config.json` (committed). */
export function resolveResearchConfigFile(): string {
  return process.env.RESEARCH_CONFIG_FILE ?? dataDir("research-config.json");
}

/** Default latest-digest file, anchored to `apps/api/data/research-digest.json` (gitignored). */
export function resolveResearchDigestFile(): string {
  return process.env.RESEARCH_DIGEST_FILE ?? dataDir("research-digest.json");
}

/** Default source fixtures dir, anchored to `apps/api/data/research/fixtures`. */
export function resolveResearchFixturesDir(): string {
  return process.env.RESEARCH_FIXTURES_DIR ?? dataDir("research/fixtures");
}

/**
 * The research / intelligence layer (M6). Imports MemoryModule for the vault write
 * surface (the digest is mirrored to `intelligence/digest` for the morning briefing);
 * ActivityLogModule is `@Global`. Exports {@link ResearchService} so the scheduler's
 * `research` automation target can dispatch a digest pass.
 */
@Module({
  imports: [MemoryModule],
  controllers: [ResearchController],
  providers: [
    { provide: RESEARCH_CONFIG_FILE, useFactory: resolveResearchConfigFile },
    { provide: RESEARCH_DIGEST_FILE, useFactory: resolveResearchDigestFile },
    { provide: RESEARCH_FIXTURES_DIR, useFactory: resolveResearchFixturesDir },
    ResearchConfigStore,
    FakeResearchAdapter,
    ResearchService,
  ],
  exports: [ResearchService, ResearchConfigStore],
})
export class ResearchModule {}
