import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { ProjectsModule } from "../projects/projects.module";
import { ResolvedProjectModule } from "../projects/resolved-project.module";
import { dataDir } from "../shared/data-dir";
import { TasksModule } from "../tasks/tasks.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { INBOX_STATE_FILE, InboxStateStore } from "./inbox-state.store";
import { InboxAddressCommentsService } from "./inbox-address-comments.service";
import { InboxPrDiffService } from "./inbox-pr-diff.service";
import { InboxRebaseService } from "./inbox-rebase.service";
import { InboxReviewService } from "./inbox-review.service";
import { InboxController } from "./inbox.controller";
import { InboxService } from "./inbox.service";

export function resolveInboxStateFile(): string {
  return process.env.INBOX_STATE_FILE ?? dataDir("inbox-state.json");
}

/** Inbox (docs/api/inbox.md). `RoadmapStore`/`RoadmapSourceService` come from the @Global RoadmapModule. */
@Module({
  // TasksModule + ApprovalsModule + WorkspaceModule (todo-11): the rebase and address-comments flows also push from a run's worktree.
  // (Phase 129 P2: the review flow creates a task and runs the `pr-review` approval kind.) None import this module — no cycle.
  imports: [
    ProjectsModule,
    ResolvedProjectModule,
    IntegrationsModule,
    TasksModule,
    ApprovalsModule,
    WorkspaceModule,
  ],
  controllers: [InboxController],
  providers: [
    { provide: INBOX_STATE_FILE, useFactory: resolveInboxStateFile },
    InboxStateStore,
    InboxService,
    InboxReviewService,
    InboxRebaseService,
    InboxAddressCommentsService,
    InboxPrDiffService,
  ],
})
export class InboxModule {}
