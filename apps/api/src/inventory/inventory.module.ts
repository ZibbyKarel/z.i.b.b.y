import { Module } from "@nestjs/common";
import { SkillsModule } from "../skills/skills.module";
import { CLAUDE_LOCATIONS, resolveClaudeLocations } from "./claude-locations";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";

/**
 * Machine inventory (TODO 13): read-only scan of the operator's Claude Code
 * install + install of ZIBBY library skills. Locations come from one provider
 * so tests point them at temp dirs (`CLAUDE_CONFIG_DIR`).
 */
@Module({
  imports: [SkillsModule],
  controllers: [InventoryController],
  providers: [{ provide: CLAUDE_LOCATIONS, useFactory: resolveClaudeLocations }, InventoryService],
})
export class InventoryModule {}
