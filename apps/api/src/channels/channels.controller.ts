import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { channelsContract } from "@zibby/contracts";
import { IntegrationNotFoundError } from "../integrations/integrations.storage.service";
import { ChannelItemStore } from "./channel-item.store";
import { JiraIssueFlowService } from "./jira-issue-flow.service";

/**
 * Read-only access to ingested channel items (items are created/transitioned only by
 * the watcher / triage flow, Law 4) plus the one outbound write surface: proposing a
 * Jira issue, which only PARKS an approval — the create runs on approve, not here.
 */
@Controller()
export class ChannelsController {
  constructor(
    private readonly store: ChannelItemStore,
    private readonly jira: JiraIssueFlowService,
  ) {}

  @TsRestHandler(channelsContract)
  handler() {
    return tsRestHandler(channelsContract, {
      listChannelItems: async ({ query }) => ({
        status: 200,
        body: await this.store.list({ integrationId: query.integrationId, state: query.state }),
      }),

      getChannelItem: async ({ params: { id } }) => {
        const item = await this.store.findById(id);
        return item
          ? { status: 200 as const, body: item }
          : { status: 404 as const, body: { message: `Channel item "${id}" not found` } };
      },

      // Operator acknowledged a surfaced item — move it to `ignored` so it drops off the
      // overview. The only client-driven state change, and a benign one: it can't forge a
      // verdict or resurrect an item, only retire a surfaced one.
      dismissChannelItem: async ({ params: { id } }) => {
        const item = await this.store.findById(id);
        if (!item) {
          return { status: 404 as const, body: { message: `Channel item "${id}" not found` } };
        }
        const dismissed = await this.store.update({ ...item, state: "ignored" });
        return { status: 200 as const, body: dismissed };
      },

      createJiraIssue: async ({ params: { id }, body }) => {
        try {
          const approval = await this.jira.propose({ integrationId: id, ...body });
          return { status: 202 as const, body: { approvalId: approval.id } };
        } catch (err) {
          if (err instanceof IntegrationNotFoundError) {
            return { status: 404 as const, body: { message: err.message } };
          }
          return { status: 422 as const, body: { message: (err as Error).message } };
        }
      },
    });
  }
}
