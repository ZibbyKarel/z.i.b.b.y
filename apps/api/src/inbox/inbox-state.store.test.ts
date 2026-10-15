import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InboxStateStore } from "./inbox-state.store";

describe("InboxStateStore", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "inbox-state-"));
    file = path.join(dir, "nested", "inbox-state.json");
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("reads { hidden: [] } for a missing or garbage file", async () => {
    expect(await new InboxStateStore(file).read()).toEqual({ hidden: [] });
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "{not json");
    expect(await new InboxStateStore(file).read()).toEqual({ hidden: [] });
  });

  it("hides and unhides idempotently by (integrationId, externalId), persisting across instances", async () => {
    const store = new InboxStateStore(file);
    const a = { integrationId: "jira-1", externalId: "PROJ-1" };
    const b = { integrationId: "jira-1", externalId: "PROJ-2" };
    await store.setHidden({ ...a, hidden: true });
    await store.setHidden({ ...a, hidden: true });
    await store.setHidden({ ...b, hidden: true });
    expect(await new InboxStateStore(file).read()).toEqual({ hidden: [a, b] });

    await store.setHidden({ ...a, hidden: false });
    await store.setHidden({ ...a, hidden: false });
    expect(await new InboxStateStore(file).read()).toEqual({ hidden: [b] });
  });
});
