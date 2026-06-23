import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ChatMessage } from "@zibby/contracts";
import { ChatTranscriptStore } from "./chat-transcript.store";

const msg = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: "m1",
  role: "user",
  text: "ahoj",
  at: "2026-06-23T10:00:00.000Z",
  ...over,
});

describe("ChatTranscriptStore", () => {
  let dir: string;
  let store: ChatTranscriptStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "zibby-chat-"));
    store = new ChatTranscriptStore(dir);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("creates and reuses the single active conversation when no id is given", async () => {
    const first = await store.ensureConversation();
    const second = await store.ensureConversation();
    expect(first).toBe(second);
    expect(await store.readActive()).toBe(first);
  });

  it("honors an explicit conversation id and creates its meta", async () => {
    const id = await store.ensureConversation("conv-explicit");
    expect(id).toBe("conv-explicit");
    // explicit ids do not hijack the active pointer
    expect(await store.readActive()).toBeNull();
  });

  it("round-trips appended messages newest-last", async () => {
    const id = await store.ensureConversation("c1");
    await store.appendMessage(id, msg({ id: "u1", role: "user", text: "jak se máš?" }));
    await store.appendMessage(id, msg({ id: "a1", role: "assistant", text: "Skvěle. 🎩" }));
    const transcript = await store.readTranscript(id);
    expect(transcript.messages.map((m) => m.id)).toEqual(["u1", "a1"]);
    expect(transcript.messages[1]?.text).toBe("Skvěle. 🎩");
  });

  it("persists and reads back the threaded session id", async () => {
    const id = await store.ensureConversation("c2");
    expect(await store.getSessionId(id)).toBeNull();
    await store.setSessionId(id, "sess-xyz");
    expect(await store.getSessionId(id)).toBe("sess-xyz");
    expect((await store.readTranscript(id)).sessionId).toBe("sess-xyz");
  });

  it("skips malformed transcript lines without throwing", async () => {
    const id = await store.ensureConversation("c3");
    await store.appendMessage(id, msg({ id: "ok" }));
    await fs.appendFile(path.join(dir, "c3.jsonl"), "garbage not json\n", "utf8");
    await store.appendMessage(id, msg({ id: "ok2" }));
    const transcript = await store.readTranscript(id);
    expect(transcript.messages.map((m) => m.id)).toEqual(["ok", "ok2"]);
  });

  it("returns an empty transcript for an unknown conversation", async () => {
    const transcript = await store.readTranscript("missing");
    expect(transcript).toEqual({ conversationId: "missing", sessionId: null, messages: [] });
  });
});
