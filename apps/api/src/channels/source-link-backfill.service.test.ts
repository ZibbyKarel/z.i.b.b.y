import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Approval, ChannelItem } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApprovalsService } from "../approvals/approvals.service";
import { ApprovalsStorageService } from "../approvals/approvals.storage.service";
import { IntegrationsStorageService } from "../integrations/integrations.storage.service";
import { ChannelItemStore } from "./channel-item.store";
import { SourceLinkBackfillService } from "./source-link-backfill.service";

const item = (over: Partial<ChannelItem> = {}): ChannelItem => ({
  id: "jira-CZ-1",
  integrationId: "jira-1",
  kind: "jira",
  externalRef: { messageId: "CZ-1" },
  receivedAt: "2026-07-01T00:00:00.000Z",
  text: "a pre-existing issue",
  raw: {},
  state: "triaged",
  ...over,
});

const approval = (over: Partial<Approval> = {}): Approval => ({
  id: "channel_1",
  runId: "jira-1/jira-CZ-1",
  kind: "channel",
  skill: "jira-1",
  action: "channel-reply",
  detail: "reply",
  risk: "medium",
  status: "pending",
  requestedAt: "2026-07-01T00:00:00.000Z",
  ...over,
});

describe("SourceLinkBackfillService (Phase 127 follow-up)", () => {
  let root: string;
  let items: ChannelItemStore;
  let integrations: IntegrationsStorageService;
  let approvals: ApprovalsService;
  let backfill: SourceLinkBackfillService;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "source-link-backfill-test-"));
    items = new ChannelItemStore(path.join(root, "channels"));
    integrations = new IntegrationsStorageService(
      path.join(root, "integrations"),
      path.join(root, "integration-state"),
    );
    approvals = new ApprovalsService(new ApprovalsStorageService(path.join(root, "approvals")));
    await Promise.all([items.onModuleInit(), integrations.ensureDir()]);
    backfill = new SourceLinkBackfillService(items, integrations, approvals);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("backfills a Jira item's url from its integration's baseUrl", async () => {
    await integrations.create({
      id: "jira-1",
      kind: "jira",
      projectId: "proj-1",
      config: { kind: "jira", baseUrl: "https://acme.atlassian.net", email: "a@acme.com" },
    });
    await items.put(item());

    await backfill.onModuleInit();

    const backfilled = await items.get("jira-1", "jira-CZ-1");
    expect(backfilled?.url).toBe("https://acme.atlassian.net/browse/CZ-1");
  });

  it("backfills a GitHub item's url using a uniform /issues/<n> path", async () => {
    await integrations.create({
      id: "gh-1",
      kind: "github",
      projectId: "proj-1",
      config: {
        kind: "github",
        repo: "acme/repo",
        username: "octocat",
        streams: ["issues", "pulls"],
      },
    });
    await items.put(
      item({
        id: "gh-42",
        integrationId: "gh-1",
        kind: "github",
        externalRef: { messageId: "42" },
      }),
    );

    await backfill.onModuleInit();

    const backfilled = await items.get("gh-1", "gh-42");
    expect(backfilled?.url).toBe("https://github.com/acme/repo/issues/42");
  });

  it("leaves a Slack item unbackfilled (no permalink reconstructable after the fact)", async () => {
    await integrations.create({
      id: "slack-1",
      kind: "slack",
      projectId: "proj-1",
      config: { kind: "slack", channels: ["C1"] },
    });
    await items.put(
      item({
        id: "slack-1-100",
        integrationId: "slack-1",
        kind: "slack",
        externalRef: { channel: "C1", ts: "100" },
      }),
    );

    await backfill.onModuleInit();

    const unchanged = await items.get("slack-1", "slack-1-100");
    expect(unchanged?.url).toBeUndefined();
  });

  it("skips an item that already has a url (idempotent — never overwrites)", async () => {
    await integrations.create({
      id: "jira-1",
      kind: "jira",
      projectId: "proj-1",
      config: { kind: "jira", baseUrl: "https://acme.atlassian.net", email: "a@acme.com" },
    });
    await items.put(item({ url: "https://elsewhere.example/CZ-1" }));

    await backfill.onModuleInit();

    const unchanged = await items.get("jira-1", "jira-CZ-1");
    expect(unchanged?.url).toBe("https://elsewhere.example/CZ-1");
  });

  it("copies a backfilled item's url onto its still-pending channel approval", async () => {
    await integrations.create({
      id: "jira-1",
      kind: "jira",
      projectId: "proj-1",
      config: { kind: "jira", baseUrl: "https://acme.atlassian.net", email: "a@acme.com" },
    });
    await items.put(item());
    const storage = new ApprovalsStorageService(path.join(root, "approvals"));
    await storage.create(approval());

    await backfill.onModuleInit();

    const decided = await approvals.get(approval().id);
    expect(decided.sourceUrl).toBe("https://acme.atlassian.net/browse/CZ-1");
  });

  it("never touches an approval that already has a sourceUrl", async () => {
    await integrations.create({
      id: "jira-1",
      kind: "jira",
      projectId: "proj-1",
      config: { kind: "jira", baseUrl: "https://acme.atlassian.net", email: "a@acme.com" },
    });
    await items.put(item());
    const storage = new ApprovalsStorageService(path.join(root, "approvals"));
    await storage.create(approval({ sourceUrl: "https://elsewhere.example/CZ-1" }));

    await backfill.onModuleInit();

    const unchanged = await approvals.get(approval().id);
    expect(unchanged.sourceUrl).toBe("https://elsewhere.example/CZ-1");
  });

  it("running onModuleInit twice is a no-op the second time (idempotent)", async () => {
    await integrations.create({
      id: "jira-1",
      kind: "jira",
      projectId: "proj-1",
      config: { kind: "jira", baseUrl: "https://acme.atlassian.net", email: "a@acme.com" },
    });
    await items.put(item());

    await backfill.onModuleInit();
    const firstPass = await items.get("jira-1", "jira-CZ-1");
    await backfill.onModuleInit();
    const secondPass = await items.get("jira-1", "jira-CZ-1");

    expect(firstPass?.url).toBe("https://acme.atlassian.net/browse/CZ-1");
    expect(secondPass).toEqual(firstPass);
  });
});
