import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@zibby/contracts";
import type { LoggerService } from "../shared/logging/logger.service";
import { ChatHandoffService, HANDOFF_COMPACT_THRESHOLD_CHARS } from "./chat-handoff.service";
import { ChatTranscriptStore } from "./chat-transcript.store";

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
} as unknown as LoggerService;

const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: "m1",
  role: "user",
  text: "hi",
  at: "2026-06-23T10:00:00.000Z",
  ...over,
});

/** Subclass the `runClaude` seam so no test ever spawns claude. */
class StubbedHandoff extends ChatHandoffService {
  constructor(
    store: ChatTranscriptStore,
    private readonly reply: () => Promise<string>,
  ) {
    super(store, fakeLogger);
  }
  protected override runClaude(): Promise<string> {
    return this.reply();
  }
}

describe("ChatHandoffService", () => {
  let dir: string;
  let store: ChatTranscriptStore;

  const seed = async (messages: ChatMessage[]) => {
    for (const m of messages) await store.appendMessage("c1", m);
  };
  const long = "x".repeat(HANDOFF_COMPACT_THRESHOLD_CHARS);

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "zibby-handoff-"));
    store = new ChatTranscriptStore(dir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("carries a short transcript verbatim", async () => {
    await seed([
      msg({ id: "u1", text: "add a button" }),
      msg({ id: "a1", role: "assistant", text: "done" }),
    ]);
    const out = await new ChatHandoffService(store, fakeLogger).build({ conversationId: "c1" });
    expect(out?.compacted).toBe(false);
    expect(out?.transcriptPath).toBe(path.resolve(dir, "c1.jsonl"));
    expect(out?.text).toContain("**Operator:** add a button\n\n**ZIBBY:** done");
    expect(out?.text).not.toContain("compacted into a brief");
  });

  it("cuts after upToMessageId, inclusive", async () => {
    await seed([
      msg({ id: "u1", text: "first" }),
      msg({ id: "a1", role: "assistant", text: "second" }),
      msg({ id: "u2", text: "third" }),
    ]);
    const out = await new ChatHandoffService(store, fakeLogger).build({
      conversationId: "c1",
      upToMessageId: "a1",
    });
    expect(out?.text).toContain("second");
    expect(out?.text).not.toContain("third");
  });

  it("compacts a long transcript via runClaude", async () => {
    vi.stubEnv("VITEST", "");
    await seed([msg({ id: "u1", text: long })]);
    const svc = new StubbedHandoff(store, async () => JSON.stringify({ result: "# Brief" }));
    const out = await svc.build({ conversationId: "c1" });
    expect(out?.compacted).toBe(true);
    expect(out?.text).toContain("compacted into a brief");
    expect(out?.text).toContain("# Brief");
  });

  it("falls back to the capped tail when compaction fails", async () => {
    vi.stubEnv("VITEST", "");
    await seed([
      msg({ id: "u1", text: `HEAD${long}` }),
      msg({ id: "a1", role: "assistant", text: "TAIL" }),
    ]);
    const svc = new StubbedHandoff(store, async () => {
      throw new Error("boom");
    });
    const out = await svc.build({ conversationId: "c1" });
    expect(out?.compacted).toBe(false);
    expect(out?.text).toContain("Earlier turns omitted");
    expect(out?.text).toContain("TAIL");
    expect(out?.text).not.toContain("HEAD");
  });

  it("returns null for an empty conversation", async () => {
    expect(
      await new ChatHandoffService(store, fakeLogger).build({ conversationId: "nope" }),
    ).toBeNull();
  });
});
