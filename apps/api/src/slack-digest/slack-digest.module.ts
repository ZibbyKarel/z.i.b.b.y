import { Module } from "@nestjs/common";
import { MarketplacesModule } from "../marketplaces/marketplaces.module";
import { MemoryModule } from "../memory/memory.module";
import { TodoModule } from "../todo/todo.module";
import { SkillsModule } from "../skills/skills.module";
import { SlackDigestService } from "./slack-digest.service";

/** Evening Slack digest. AutomationsModule imports this for the `slack-digest` target. */
@Module({
  imports: [MemoryModule, SkillsModule, TodoModule, MarketplacesModule],
  providers: [SlackDigestService],
  exports: [SlackDigestService],
})
export class SlackDigestModule {}
