import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { ChannelItem } from "@zibby/contracts";
import { ApprovalsService } from "../approvals/approvals.service";
import { IntegrationsStorageService } from "../integrations/integrations.storage.service";
import { ChannelItemStore } from "./channel-item.store";

/**
 * Phase 127 follow-up — one-shot, idempotent startup backfill (mirrors
 * `OwnerBackfillService`) that stamps `url` onto pre-existing Jira/GitHub
 * channel items and `sourceUrl` onto their still-pending "channel" approvals.
 * Phase 127 itself only stamps these fields going forward (at ingest / at
 * parking time), so every record written before that code shipped was missing
 * its link — this closes that gap for the two kinds where the URL is cheaply
 * re-derivable from data already on disk (issue key + the integration's
 * non-secret config), with no extra network calls.
 *
 * Slack is NOT backfilled: a permalink cannot be reconstructed after the fact,
 * only fetched live via `chat.getPermalink` at ingest time — re-running that
 * call for every historical message would reintroduce the per-item API cost
 * the design deliberately kept off this path. Old Slack items get a link only
 * once re-ingested by the adapter.
 */
@Injectable()
export class SourceLinkBackfillService implements OnModuleInit {
  private readonly logger = new Logger(SourceLinkBackfillService.name);

  constructor(
    private readonly items: ChannelItemStore,
    private readonly integrations: IntegrationsStorageService,
    private readonly approvals: ApprovalsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.backfillItems();
    await this.backfillApprovals();
  }

  private async backfillItems(): Promise<void> {
    const all = await this.items.list();
    for (const item of all) {
      if (item.url) continue;
      const url = await this.deriveUrl(item);
      if (!url) continue;
      await this.tag(`item ${item.integrationId}/${item.id}`, () =>
        this.items.update({ ...item, url }),
      );
    }
  }

  private async deriveUrl(item: ChannelItem): Promise<string | undefined> {
    if (item.kind !== "jira" && item.kind !== "github") return undefined;
    const integration = await this.integrations.get(item.integrationId).catch(() => null);
    if (!integration) return undefined;
    if (item.kind === "jira" && integration.config.kind === "jira") {
      return `${integration.config.baseUrl}/browse/${item.externalRef.messageId}`;
    }
    if (item.kind === "github" && integration.config.kind === "github") {
      // GitHub redirects /issues/<n> to /pull/<n> when it's actually a PR, so a
      // uniform "issues" URL is correct without re-deriving the PR/issue split.
      return `https://github.com/${integration.config.repo}/issues/${item.externalRef.messageId}`;
    }
    return undefined;
  }

  private async backfillApprovals(): Promise<void> {
    const pending = await this.approvals.list("pending");
    for (const approval of pending) {
      if (approval.kind !== "channel" || approval.sourceUrl) continue;
      const item = await this.itemFromRef(approval.runId);
      const url = item?.url;
      if (!url) continue;
      await this.tag(`approval ${approval.id}`, () =>
        this.approvals.patchSourceUrl(approval.id, url),
      );
    }
  }

  /** Same `<integrationId>/<itemId>` ref convention as `ChannelTriageFlowService`. */
  private async itemFromRef(runId: string): Promise<ChannelItem | null> {
    const slash = runId.indexOf("/");
    if (slash === -1) return null;
    return this.items.get(runId.slice(0, slash), runId.slice(slash + 1));
  }

  /** Per-entity try/catch — one bad write is logged and skipped, never fatal to boot. */
  private async tag(label: string, write: () => Promise<unknown>): Promise<void> {
    try {
      await write();
    } catch (error) {
      this.logger.warn(`Skipping source-link backfill for ${label}: ${String(error)}`);
    }
  }
}
