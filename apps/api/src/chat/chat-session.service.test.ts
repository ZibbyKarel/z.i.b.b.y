import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ChatPersona } from "@zibby/contracts";
import { fakeSystemConfigStore } from "../system/system-config.fixture";
import { CHAT_GOVERNOR_PROMPT, CHAT_PERSONAS } from "./chat-persona";
import { ChatEventsService, type ChatTurnEvent } from "./chat-events.service";
import { ChatSessionService, type ClaudeProcess } from "./chat-session.service";
import { ChatTranscriptStore } from "./chat-transcript.store";

/** A fake `claude` process that replays canned stream-json lines then closes. */
class FakeClaude extends EventEmitter implements ClaudeProcess {
  readonly stdout = new PassThrough();
  constructor(private readonly lines: string[]) {
    super();
    setImmediate(() => {
      for (const line of this.lines) this.stdout.write(`${line}\n`);
      this.stdout.end();
      this.emit("close", 0);
    });
  }
  kill(): boolean {
    return true;
  }
}

class TestSession extends ChatSessionService {
  lastArgs: string[] = [];
  constructor(
    store: ChatTranscriptStore,
    events: ChatEventsService,
    private readonly lines: string[],
    persona: ChatPersona = "jarvis",
  ) {
    super(store, events, fakeSystemConfigStore({ chatPersona: persona }));
  }
  protected createProcess(args: string[]): ClaudeProcess {
    this.lastArgs = args;
    return new FakeClaude(this.lines);
  }
}

const NOW = new Date("2026-06-23T10:00:00.000Z");
const line = (obj: unknown): string => JSON.stringify(obj);

describe("ChatSessionService", () => {
  let dir: string;
  let store: ChatTranscriptStore;
  let events: ChatEventsService;
  let seen: ChatTurnEvent[];

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "zibby-chat-svc-"));
    store = new ChatTranscriptStore(dir);
    events = new ChatEventsService();
    seen = [];
    events.stream().subscribe((e) => seen.push(e));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });

  /** Resolve once the background turn settles (done/error) so cleanup doesn't race it. */
  const settled = (turnId: string): Promise<void> =>
    new Promise((resolve) => {
      const sub = events.stream().subscribe((e) => {
        if (e.turnId === turnId && (e.type === "done" || e.type === "error")) {
          sub.unsubscribe();
          resolve();
        }
      });
    });

  it("builds the verified isolated streaming arg vector", () => {
    const svc = new TestSession(store, events, []);
    const args = svc.buildArgs("ahoj", null);
    expect(args).toContain("--include-partial-messages");
    expect(args).toContain("--model");
    expect(args[args.indexOf("--model") + 1]).toBe("sonnet");
    expect(args[args.indexOf("--permission-mode") + 1]).toBe("dontAsk");
    // isolation: --setting-sources with an empty value
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("");
    // built-in tools disabled — chat acts only via the zibby MCP tools
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args).not.toContain("--resume");
  });

  it("wires the zibby MCP tool server (--mcp-config + --allowedTools)", () => {
    const svc = new TestSession(store, events, []);
    const args = svc.buildArgs("ahoj", null);
    expect(args[args.indexOf("--allowedTools") + 1]).toBe("mcp__zibby__*");
    const config = JSON.parse(args[args.indexOf("--mcp-config") + 1] ?? "{}");
    expect(config.mcpServers.zibby.type).toBe("http");
    expect(config.mcpServers.zibby.url).toMatch(/\/api\/chat\/mcp$/);
  });

  it("adds --resume with the threaded session id", () => {
    const svc = new TestSession(store, events, []);
    const args = svc.buildArgs("ahoj", "sess-7");
    expect(args[args.indexOf("--resume") + 1]).toBe("sess-7");
  });

  it("appends the selected persona tone, always over the constant governor", () => {
    const jarvis = new TestSession(store, events, [], "jarvis").buildArgs("ahoj", null);
    const concise = new TestSession(store, events, [], "concise").buildArgs("ahoj", null);

    const jarvisPrompt = jarvis[jarvis.indexOf("--append-system-prompt") + 1] ?? "";
    const concisePrompt = concise[concise.indexOf("--append-system-prompt") + 1] ?? "";

    // The tone block swaps with the persona…
    expect(jarvisPrompt).toContain(CHAT_PERSONAS.jarvis);
    expect(concisePrompt).toContain(CHAT_PERSONAS.concise);
    expect(jarvisPrompt).not.toContain(CHAT_PERSONAS.concise);
    // …but the answer/ask/act governor is invariant across personas.
    expect(jarvisPrompt).toContain(CHAT_GOVERNOR_PROMPT);
    expect(concisePrompt).toContain(CHAT_GOVERNOR_PROMPT);
  });

  it("streams deltas, persists the assistant turn and the session id", async () => {
    const svc = new TestSession(store, events, [
      line({ type: "system", subtype: "init", session_id: "sess-1" }),
      line({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Ahoj" } } }),
      line({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: ", pane." } } }),
      line({ type: "result", is_error: false, result: "Ahoj, pane." }),
    ]);
    const id = await store.ensureConversation("c1");
    await svc.runTurn(id, "turn-1", "ahoj", NOW);

    const deltas = seen.filter((e) => e.type === "delta").map((e) => (e.type === "delta" ? e.text : ""));
    expect(deltas).toEqual(["Ahoj", ", pane."]);
    expect(seen.at(-1)?.type).toBe("done");

    const transcript = await store.readTranscript(id);
    expect(transcript.sessionId).toBe("sess-1");
    const assistant = transcript.messages.find((m) => m.role === "assistant");
    expect(assistant?.text).toBe("Ahoj, pane.");
  });

  it("announces a tool dispatch inline and records it on the message", async () => {
    const svc = new TestSession(store, events, [
      line({ type: "system", subtype: "init", session_id: "s" }),
      line({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Jdu na to." } } }),
      line({ type: "assistant", message: { content: [{ type: "tool_use", name: "mcp__zibby__create_task", input: { text: "postav X" } }] } }),
      line({ type: "result", is_error: false, result: "Jdu na to." }),
    ]);
    const id = await store.ensureConversation("c2");
    await svc.runTurn(id, "turn-2", "postav X", NOW);

    const tool = seen.find((e) => e.type === "tool");
    expect(tool && tool.type === "tool" && tool.tool.name).toBe("create_task");
    expect(tool && tool.type === "tool" && tool.tool.href).toBe("/runs");

    const assistant = (await store.readTranscript(id)).messages.find((m) => m.role === "assistant");
    expect(assistant?.toolEvents?.[0]?.name).toBe("create_task");
  });

  it("emits an error turn and persists no assistant message on failure", async () => {
    const svc = new TestSession(store, events, [
      line({ type: "system", subtype: "init", session_id: "s" }),
      line({ type: "result", is_error: true, result: "Not logged in" }),
    ]);
    const id = await store.ensureConversation("c3");
    await svc.runTurn(id, "turn-3", "ahoj", NOW);

    expect(seen.some((e) => e.type === "error")).toBe(true);
    const transcript = await store.readTranscript(id);
    expect(transcript.messages.some((m) => m.role === "assistant")).toBe(false);
  });

  it("sendMessage appends the user turn and returns ids", async () => {
    const svc = new TestSession(store, events, [
      line({ type: "system", subtype: "init", session_id: "s" }),
      line({ type: "result", is_error: false, result: "ok" }),
    ]);
    const result = await svc.sendMessage({ text: "jak se máš?" }, NOW);
    expect(result.conversationId).toBeTruthy();
    expect(result.turnId).toBeTruthy();
    await settled(result.turnId);
    const transcript = await store.readTranscript(result.conversationId);
    expect(transcript.messages[0]?.role).toBe("user");
    expect(transcript.messages[0]?.text).toBe("jak se máš?");
  });
});
