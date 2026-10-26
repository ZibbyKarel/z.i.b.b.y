import { Module } from "@nestjs/common";
import { resolveClaudePluginsDir } from "./marketplace-catalog";
import { MarketplaceCli } from "./marketplace-cli";
import { MarketplacesController } from "./marketplaces.controller";
import {
  CLAUDE_PLUGINS_DIR,
  MARKETPLACES_CLONE_DIR,
  MarketplacesService,
  resolveMarketplacesCloneDir,
} from "./marketplaces.service";
import {
  MARKETPLACES_FILE,
  MarketplacesStore,
  resolveMarketplacesFile,
} from "./marketplaces.store";

@Module({
  controllers: [MarketplacesController],
  providers: [
    { provide: MARKETPLACES_FILE, useFactory: resolveMarketplacesFile },
    { provide: CLAUDE_PLUGINS_DIR, useFactory: resolveClaudePluginsDir },
    { provide: MARKETPLACES_CLONE_DIR, useFactory: resolveMarketplacesCloneDir },
    MarketplacesStore,
    MarketplaceCli,
    MarketplacesService,
  ],
})
export class MarketplacesModule {}
