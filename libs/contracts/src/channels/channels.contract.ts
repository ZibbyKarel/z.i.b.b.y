import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import { IntegrationIdSchema } from "../integrations/integration.schema";
import { ChannelItemSchema, ChannelItemStateSchema } from "./channel.schema";

const c = initContract();

/**
 * Channels (Phase 5): mostly READ-ONLY access to ingested inbound items. A client can
 * never CREATE an item or forge its triage verdict (Law 4) — those are stamped only by
 * the watcher / triage paths inside the API. The one client write is `dismiss`: an
 * operator acknowledging a surfaced notify-only item, exactly like approving/rejecting
 * an approval. It only moves a `triaged` item to `ignored`; it cannot inject content or
 * raise privilege.
 */
export const channelsContract = c.router(
  {
    listChannelItems: {
      method: "GET",
      path: "/channels/items",
      query: z.object({
        integrationId: IntegrationIdSchema.optional(),
        state: ChannelItemStateSchema.optional(),
      }),
      responses: { 200: z.array(ChannelItemSchema) },
      summary: "List ingested channel items (optionally filtered)",
    },
    getChannelItem: {
      method: "GET",
      path: "/channels/items/:id",
      pathParams: z.object({ id: z.string().min(1) }),
      responses: { 200: ChannelItemSchema, 404: ErrorSchema },
      summary: "Get one channel item by id",
    },
    // Operator dismiss of a surfaced notify-only item: moves `triaged` → `ignored` so it
    // leaves the overview "needs your attention" list. Idempotent-ish; 404 if unknown.
    dismissChannelItem: {
      method: "POST",
      path: "/channels/items/:id/dismiss",
      pathParams: z.object({ id: z.string().min(1) }),
      body: z.object({}).optional(),
      responses: { 200: ChannelItemSchema, 404: ErrorSchema },
      summary: "Dismiss a surfaced channel item (operator acknowledged it)",
    },
    // The finished-day "creates a Jira task": parks an outbound Jira-issue create
    // behind a Tier-3 `jira-issue` approval (never creates directly). Returns the
    // approval id; the create runs only on approve. 404 = unknown integration,
    // 422 = not a jira integration.
    createJiraIssue: {
      method: "POST",
      path: "/channels/integrations/:id/jira-issue",
      pathParams: z.object({ id: IntegrationIdSchema }),
      body: z.object({
        summary: z.string().min(1),
        description: z.string().optional(),
        projectKey: z.string().min(1).optional(),
      }),
      responses: { 202: z.object({ approvalId: z.string() }), 404: ErrorSchema, 422: ErrorSchema },
      summary: "Propose a Jira issue (parked for approval)",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type ChannelsContract = typeof channelsContract;
