import * as path from "node:path";
import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { ApprovalsService } from "../approvals/approvals.service";
import { CredentialsStore } from "../integrations/credentials.store";
import { resolveCredentialsDir } from "../integrations/integrations.module";
import { ScheduledTasksStorageModule } from "../tasks/scheduled-tasks-storage.module";
import { ScheduledTasksStorageService } from "../tasks/scheduled-tasks.storage.service";
import { WorkflowRunnerService } from "../workflows/workflow-runner.service";
import { WorkflowsModule } from "../workflows/workflows.module";
import { OperatorChannelStoreModule } from "./operator-channel-store.module";
import { OperatorChannelController } from "./operator-channel.controller";
import { OPERATOR_CREDENTIALS, OperatorChannelService } from "./operator-channel.service";
import type { OperatorEventLookups } from "./operator-events";
import { OPERATOR_EVENT_LOOKUPS, OperatorNotifier } from "./operator-notifier.service";

/**
 * The Slack operator channel (Phase 1 — outbound). The notifier rides the global
 * activity stream; the lookups read the task, approval and workflow-run stores
 * read-only to enrich an entry (PR url, park reason). Tokens live in their own
 * gitignored `credentials/operator-channel/` dir (a scoped {@link CredentialsStore}),
 * never next to an integration's secret and never in the settings file.
 */
@Module({
  imports: [
    OperatorChannelStoreModule,
    ApprovalsModule,
    ScheduledTasksStorageModule,
    WorkflowsModule,
  ],
  controllers: [OperatorChannelController],
  providers: [
    {
      provide: OPERATOR_CREDENTIALS,
      useFactory: () =>
        new CredentialsStore(path.join(resolveCredentialsDir(), "operator-channel")),
    },
    {
      provide: OPERATOR_EVENT_LOOKUPS,
      inject: [ScheduledTasksStorageService, ApprovalsService, WorkflowRunnerService],
      useFactory: (
        tasks: ScheduledTasksStorageService,
        approvals: ApprovalsService,
        runs: WorkflowRunnerService,
      ): OperatorEventLookups => ({
        task: (id) => tasks.get(id).catch(() => null),
        approval: (id) => approvals.get(id).catch(() => null),
        workflowRun: (id) => {
          try {
            return runs.get(id);
          } catch {
            return null;
          }
        },
      }),
    },
    OperatorChannelService,
    OperatorNotifier,
  ],
  exports: [OperatorChannelService, OperatorNotifier],
})
export class OperatorChannelModule {}
