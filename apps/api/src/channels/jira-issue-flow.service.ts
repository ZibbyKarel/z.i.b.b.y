import { randomUUID } from "node:crypto";
import { Injectable, type OnModuleInit, Optional } from "@nestjs/common";
import type { Approval } from "@zibby/contracts";
import { ApprovalsService, type ResumableRunner } from "../approvals/approvals.service";
import { ActivityLogService } from "../activity/activity-log.service";
import { CredentialsStore } from "../integrations/credentials.store";
import { IntegrationsStorageService } from "../integrations/integrations.storage.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { JiraChannelAdapter } from "./adapters/jira.adapter";

export interface JiraIssueRequest {
  integrationId: string;
  summary: string;
  description?: string;
  projectKey?: string;
}

/**
 * The finished-day "ZIBBY ... creates a Jira task ... and surfaces it for approval."
 * An outbound Jira-issue create is ALWAYS Tier-3: {@link propose} parks it behind a
 * `jira-issue` approval (never creating anything itself), {@link resume} performs the
 * gated POST only once the operator approves, {@link cancel} drops a rejected request.
 * This is the {@link ResumableRunner} for `jira-issue`, mirroring the proposed-task
 * and channel-reply approval seams — the gate cannot be talked around (Law 1/4).
 *
 * Pending requests are held in memory keyed by the approval's runId; the durable gate
 * is the approval record itself, so a restart that loses the map simply makes resume a
 * no-op (fail-closed — never an unapproved create).
 */
@Injectable()
export class JiraIssueFlowService implements OnModuleInit, ResumableRunner {
  private readonly log: ScopedLogger;
  private readonly adapter: JiraChannelAdapter;
  private readonly pending = new Map<string, JiraIssueRequest>();

  constructor(
    private readonly approvals: ApprovalsService,
    private readonly integrations: IntegrationsStorageService,
    private readonly credentials: CredentialsStore,
    private readonly activity: ActivityLogService,
    logger: LoggerService,
    // Optional so Nest doesn't try to DI-resolve it — the real adapter is
    // default-constructed; a test injects one with a stub fetch.
    @Optional() adapter?: JiraChannelAdapter,
  ) {
    this.log = logger.child(JiraIssueFlowService.name);
    this.adapter = adapter ?? new JiraChannelAdapter();
  }

  onModuleInit(): void {
    this.approvals.register("jira-issue", this);
  }

  /** Park a Jira-issue create behind a Tier-3 approval. Returns the approval. */
  async propose(req: JiraIssueRequest): Promise<Approval> {
    const integration = await this.integrations.get(req.integrationId);
    if (integration.config.kind !== "jira")
      throw new Error(`integration ${req.integrationId} is not a jira integration`);
    const runId = randomUUID();
    this.pending.set(runId, req);
    const approval = await this.approvals.requestApproval({
      runId,
      kind: "jira-issue",
      skill: "channels",
      action: "jira.create_issue",
      detail: `Create Jira issue in ${integration.config.projectKey ?? req.integrationId}: ${req.summary}`,
      risk: "low",
    });
    this.log.info("jira issue parked for approval", {
      integrationId: req.integrationId,
      approvalId: approval.id,
    });
    return approval;
  }

  /** Approve → perform the gated Jira-issue create exactly once. */
  async resume(runId: string): Promise<void> {
    const req = this.pending.get(runId);
    if (!req) {
      this.log.warn("jira-issue resume skipped (no pending request)", { runId });
      return;
    }
    this.pending.delete(runId);
    const integration = await this.integrations.get(req.integrationId).catch(() => null);
    if (!integration || integration.config.kind !== "jira") {
      this.log.warn("jira-issue resume aborted (integration gone)", {
        integrationId: req.integrationId,
      });
      return;
    }
    const creds = await this.credentials.read(req.integrationId);
    if (!creds) {
      this.log.warn("jira-issue resume aborted (no credentials)", {
        integrationId: req.integrationId,
      });
      return;
    }
    const key = await this.adapter.createIssue(integration, creds, {
      summary: req.summary,
      description: req.description,
      projectKey: req.projectKey,
    });
    void this.activity.record({
      kind: "channel-approval",
      summary: `created Jira issue ${key} — ${req.summary}`,
      refs: { integrationId: req.integrationId, action: "jira.create_issue", status: key },
    });
    this.log.info("jira issue created on approval", { integrationId: req.integrationId, key });
  }

  /** Reject → drop the pending request (no issue is created). */
  cancel(runId: string): void {
    this.pending.delete(runId);
  }
}
