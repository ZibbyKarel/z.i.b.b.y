import { Module } from "@nestjs/common";
import { IntegrationsModule } from "../integrations/integrations.module";
import { ProjectsModule } from "../projects/projects.module";
import { ResolvedProjectModule } from "../projects/resolved-project.module";
import { dataDir } from "../shared/data-dir";
import { INBOX_STATE_FILE, InboxStateStore } from "./inbox-state.store";
import { InboxController } from "./inbox.controller";
import { InboxService } from "./inbox.service";

export function resolveInboxStateFile(): string {
  return process.env.INBOX_STATE_FILE ?? dataDir("inbox-state.json");
}

/** Inbox (docs/api/inbox.md). `RoadmapStore`/`RoadmapSourceService` come from the @Global RoadmapModule. */
@Module({
  imports: [ProjectsModule, ResolvedProjectModule, IntegrationsModule],
  controllers: [InboxController],
  providers: [
    { provide: INBOX_STATE_FILE, useFactory: resolveInboxStateFile },
    InboxStateStore,
    InboxService,
  ],
})
export class InboxModule {}
