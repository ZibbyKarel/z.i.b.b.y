import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type ThreadBinding,
  ThreadBindingStore,
  threadConversationId,
} from "./thread-binding.store";

const binding = (over: Partial<ThreadBinding> = {}): ThreadBinding => ({
  channel: "D1",
  threadTs: "1700000000.000001",
  conversationId: threadConversationId("1700000000.000001"),
  title: "Fix login",
  at: "2026-10-29T12:00:00.000Z",
  taskId: "t-1",
  runId: "run-1",
  prRef: "https://github.com/acme/app/pull/7",
  ...over,
});

describe("ThreadBindingStore", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "thread-bindings-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("binds {channel, thread_ts} and reads it back, also from a fresh instance (on disk)", async () => {
    await new ThreadBindingStore(dir).bind(binding());
    const fresh = new ThreadBindingStore(dir);
    expect(await fresh.get("D1", "1700000000.000001")).toEqual(binding());
    expect(await fresh.get("D1", "1700000000.999999")).toBeNull();
    expect(await fresh.get("D2", "1700000000.000001")).toBeNull();
  });

  it("finds the thread of the announced task and of a follow-up started from it", async () => {
    const store = new ThreadBindingStore(dir);
    await store.bind(binding());
    await store.addFollowUp("D1", "1700000000.000001", "t-follow");
    await store.addFollowUp("D1", "1700000000.000001", "t-follow"); // idempotent
    await store.addFollowUp("D1", "no-such-thread", "t-orphan"); // unbound → no-op
    const fresh = new ThreadBindingStore(dir);
    expect((await fresh.forTask("t-1"))?.threadTs).toBe("1700000000.000001");
    expect((await fresh.forTask("t-follow"))?.followUpTaskIds).toEqual(["t-follow"]);
    expect(await fresh.forTask("t-orphan")).toBeNull();
  });

  it("skips garbage entries and a garbage file", async () => {
    await fs.writeFile(
      path.join(dir, "thread-bindings.json"),
      JSON.stringify({ "D1:x": { nope: true }, "D1:1700000000.000001": binding() }),
    );
    const store = new ThreadBindingStore(dir);
    expect(await store.get("D1", "x")).toBeNull();
    expect(await store.get("D1", "1700000000.000001")).not.toBeNull();
    await fs.writeFile(path.join(dir, "thread-bindings.json"), "{not json");
    expect(await new ThreadBindingStore(dir).get("D1", "1700000000.000001")).toBeNull();
  });
});
