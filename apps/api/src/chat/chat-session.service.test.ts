import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ChatPersona, ChatToolEvent, TaskTarget } from "@zibby/contracts";
import { KbMcpAuthService } from "../kb/kb-mcp-auth.service";
import { fakeSystemConfigStore } from "../system/system-config.fixture";
import { CHAT_GOVERNOR_PROMPT, CHAT_PERSONAS } from "./chat-persona";
import { ChatEventsService, type ChatTurnEvent } from "./chat-events.service";
import { ChatMcpAuthService } from "./chat-mcp-auth.service";
import { ChatSessionService, type ClaudeProcess, mergeToolEvent } from "./chat-session.service";
import { ChatToolResultRegistry } from "./chat-tool-result.registry";
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
    toolResults: ChatToolResultRegistry = new ChatToolResultRegistry(),
    // T9: a fresh in-memory token per TestSession by default (no test depends on a
    // FIXED value unless it constructs its own ChatMcpAuthService — see the
    // dedicated "MCP config auth" block below); files spill to the OS tmp dir
    // (collision-resistant filenames — no cleanup needed for these incidental
    // writes, mirrors "safe to leave" per task-9-brief.md).
    mcpAuth: ChatMcpAuthService = new ChatMcpAuthService(),
    chatDir: string = os.tmpdir(),
    // Task 8: a fresh in-memory KB auth service per TestSession by default — same
    // posture as `mcpAuth` above; tests asserting a SPECIFIC KB token construct
    // their own and pass it explicitly (see the "zibby-kb MCP server" block below).
    kbMcpAuth: KbMcpAuthService = new KbMcpAuthService(),
  ) {
    super(
      store,
      events,
      fakeSystemConfigStore({ chatPersona: persona }),
      toolResults,
      mcpAuth,
      chatDir,
      kbMcpAuth,
    );
  }
  protected createProcess(args: string[]): ClaudeProcess {
    this.lastArgs = args;
    return new FakeClaude(this.lines);
  }
}

const NOW = new Date("2026-06-23T10:00:00.000Z");
const line = (obj: unknown): string => JSON.stringify(obj);

describe("mergeToolEvent", () => {
  it("appends an event with no callId", () => {
    const started: ChatToolEvent = { name: "recall_memory", status: "ok" };
    expect(mergeToolEvent([], started)).toEqual([started]);
  });

  it("appends an event whose callId doesn't match any existing entry", () => {
    const first: ChatToolEvent = { name: "create_task", status: "started", callId: "a" };
    const second: ChatToolEvent = { name: "create_task", status: "started", callId: "b" };
    expect(mergeToolEvent([first], second)).toEqual([first, second]);
  });

  it("replaces the entry with the matching callId in place, preserving position", () => {
    const started: ChatToolEvent = {
      name: "create_task",
      status: "started",
      callId: "a",
      summary: "Spouštím úkol…",
    };
    const other: ChatToolEvent = { name: "recall_memory", status: "ok" };
    const ok: ChatToolEvent = {
      name: "create_task",
      status: "ok",
      callId: "a",
      summary: "Spustil jsem úkol — pipeline Delivery.",
      href: "/archiv?run=r1",
    };

    const merged = mergeToolEvent([started, other], ok);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual(ok);
    expect(merged[1]).toEqual(other);
  });

  it("does not mutate the input array", () => {
    const started: ChatToolEvent = { name: "create_task", status: "started", callId: "a" };
    const events = [started];
    const ok: ChatToolEvent = { name: "create_task", status: "ok", callId: "a" };

    const merged = mergeToolEvent(events, ok);

    expect(events).toEqual([started]);
    expect(merged).not.toBe(events);
  });
});

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

  it("builds the verified isolated streaming arg vector", async () => {
    const svc = new TestSession(store, events, []);
    const args = await svc.buildArgs("ahoj", null, "c1");
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

  it("wires the zibby MCP tool server (--mcp-config file + --allowedTools), scoped to the conversation", async () => {
    const svc = new TestSession(
      store,
      events,
      [],
      "jarvis",
      new ChatToolResultRegistry(),
      undefined,
      dir,
    );
    const args = await svc.buildArgs("ahoj", null, "c1");
    // Task 8: widened to cover BOTH mounted servers — a permission-list PROMPTING
    // hint (commit eb525567), not what makes either server reachable.
    expect(args[args.indexOf("--allowedTools") + 1]).toBe("mcp__zibby__*,mcp__zibby-kb__*");
    // T9: the config is now spilled to a file — the argv value is a PATH, not inline JSON.
    const configPath = args[args.indexOf("--mcp-config") + 1] ?? "";
    expect(configPath).toMatch(/\.json$/);
    const config = JSON.parse(await fs.readFile(configPath, "utf8"));
    expect(config.mcpServers.zibby.type).toBe("http");
    expect(config.mcpServers.zibby.url).toMatch(/\/api\/chat\/mcp\?conversationId=c1$/);
  });

  describe("zibby-kb MCP server (Task 8 — the load-bearing wiring: chat can now reach the KB)", () => {
    it("mounts a zibby-kb entry carrying the KB auth service's CHAT token — never the run token", async () => {
      const kbMcpAuth = new KbMcpAuthService();
      const svc = new TestSession(
        store,
        events,
        [],
        "jarvis",
        new ChatToolResultRegistry(),
        undefined,
        dir,
        kbMcpAuth,
      );
      const args = await svc.buildArgs("ahoj", null, "c1");
      const configPath = args[args.indexOf("--mcp-config") + 1] ?? "";
      const config = JSON.parse(await fs.readFile(configPath, "utf8"));

      expect(config.mcpServers["zibby-kb"].type).toBe("http");
      expect(config.mcpServers["zibby-kb"].headers.Authorization).toBe(
        `Bearer ${kbMcpAuth.chatBearerToken}`,
      );
      // Discriminating: a swap to the run token (a plausible wrong wiring the brief
      // calls out explicitly) would make every chat KB call correctly return `[]`.
      expect(config.mcpServers["zibby-kb"].headers.Authorization).not.toBe(
        `Bearer ${kbMcpAuth.runBearerToken}`,
      );
      // The token must live only inside the (non-argv) mcp-config file's JSON —
      // never inlined onto the CLI argument vector itself (mirrors the existing
      // "zibby" run-token argv check below; an implementation that put the KB
      // header directly on argv instead of in the config file would fail only here).
      expect(args.some((arg) => arg.includes(kbMcpAuth.chatBearerToken))).toBe(false);
    });

    it("omits the ?teamId= query param entirely when the turn carries no team tag", async () => {
      const svc = new TestSession(store, events, [], "jarvis", new ChatToolResultRegistry());
      const args = await svc.buildArgs("ahoj", null, "c1");
      const configPath = args[args.indexOf("--mcp-config") + 1] ?? "";
      const config = JSON.parse(await fs.readFile(configPath, "utf8"));

      expect(config.mcpServers["zibby-kb"].url).toMatch(/\/api\/kb\/mcp$/);
      expect(config.mcpServers["zibby-kb"].url).not.toContain("?");
    });

    it("carries an explicit teamId as the ?teamId= query param, mirroring conversationId", async () => {
      const svc = new TestSession(store, events, [], "jarvis", new ChatToolResultRegistry());
      const args = await svc.buildArgs("ahoj", null, "c1", "devrel");
      const configPath = args[args.indexOf("--mcp-config") + 1] ?? "";
      const config = JSON.parse(await fs.readFile(configPath, "utf8"));

      expect(config.mcpServers["zibby-kb"].url).toMatch(/\/api\/kb\/mcp\?teamId=devrel$/);
    });

    it("threads body.teamId from sendMessage through runTurn into the zibby-kb url", async () => {
      const svc = new TestSession(store, events, [
        line({ type: "system", subtype: "init", session_id: "s" }),
        line({ type: "result", is_error: false, result: "ok" }),
      ]);
      const result = await svc.sendMessage(
        { conversationId: "c-team-1", text: "co víme o partner portálu?", teamId: "devrel" },
        NOW,
      );
      await settled(result.turnId);

      const configPath = svc.lastArgs[svc.lastArgs.indexOf("--mcp-config") + 1] ?? "";
      const config = JSON.parse(await fs.readFile(configPath, "utf8"));
      expect(config.mcpServers["zibby-kb"].url).toMatch(/\/api\/kb\/mcp\?teamId=devrel$/);
    });

    it("mounts no ?teamId= at all when sendMessage's body carries none", async () => {
      const svc = new TestSession(store, events, [
        line({ type: "system", subtype: "init", session_id: "s" }),
        line({ type: "result", is_error: false, result: "ok" }),
      ]);
      const result = await svc.sendMessage({ conversationId: "c-team-2", text: "ahoj" }, NOW);
      await settled(result.turnId);

      const configPath = svc.lastArgs[svc.lastArgs.indexOf("--mcp-config") + 1] ?? "";
      const config = JSON.parse(await fs.readFile(configPath, "utf8"));
      expect(config.mcpServers["zibby-kb"].url).toMatch(/\/api\/kb\/mcp$/);
      expect(config.mcpServers["zibby-kb"].url).not.toContain("?");
    });
  });

  it("adds --resume with the threaded session id", async () => {
    const svc = new TestSession(store, events, []);
    const args = await svc.buildArgs("ahoj", "sess-7", "c1");
    expect(args[args.indexOf("--resume") + 1]).toBe("sess-7");
  });

  it("appends the selected persona tone, always over the constant governor", async () => {
    const jarvis = await new TestSession(store, events, [], "jarvis").buildArgs("ahoj", null, "c1");
    const concise = await new TestSession(store, events, [], "concise").buildArgs(
      "ahoj",
      null,
      "c1",
    );

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
      line({
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "text_delta", text: "Ahoj" } },
      }),
      line({
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "text_delta", text: ", pane." } },
      }),
      line({ type: "result", is_error: false, result: "Ahoj, pane." }),
    ]);
    const id = await store.ensureConversation("c1");
    await svc.runTurn(id, "turn-1", "ahoj", NOW);

    const deltas = seen
      .filter((e) => e.type === "delta")
      .map((e) => (e.type === "delta" ? e.text : ""));
    expect(deltas).toEqual(["Ahoj", ", pane."]);
    expect(seen.at(-1)?.type).toBe("done");

    const transcript = await store.readTranscript(id);
    expect(transcript.sessionId).toBe("sess-1");
    const assistant = transcript.messages.find((m) => m.role === "assistant");
    expect(assistant?.text).toBe("Ahoj, pane.");
  });

  it("announces a create_task dispatch as started immediately, carrying its callId", async () => {
    const svc = new TestSession(store, events, [
      line({ type: "system", subtype: "init", session_id: "s" }),
      line({
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "text_delta", text: "Jdu na to." } },
      }),
      line({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "toolu_2",
              name: "mcp__zibby__create_task",
              input: { text: "postav X" },
            },
          ],
        },
      }),
      line({ type: "result", is_error: false, result: "Jdu na to." }),
    ]);
    const id = await store.ensureConversation("c2");
    await svc.runTurn(id, "turn-2", "postav X", NOW);

    // Only ONE tool frame ever goes out — the started announcement — because no
    // structured result (registry push) ever arrives for this turn.
    const toolFrames = seen.filter((e) => e.type === "tool");
    expect(toolFrames).toHaveLength(1);
    const tool = toolFrames[0];
    expect(tool && tool.type === "tool" && tool.tool.name).toBe("create_task");
    expect(tool && tool.type === "tool" && tool.tool.status).toBe("started");
    expect(tool && tool.type === "tool" && tool.tool.callId).toBe("toolu_2");
    expect(tool && tool.type === "tool" && tool.tool.href).toBeUndefined();

    // The unresolved started event is left as-is on the persisted message (acceptable
    // per spec — e.g. the dispatch errored, or a scheduled/pending outcome never
    // pushes a structured result).
    const assistant = (await store.readTranscript(id)).messages.find((m) => m.role === "assistant");
    expect(assistant?.toolEvents).toHaveLength(1);
    expect(assistant?.toolEvents?.[0]?.name).toBe("create_task");
    expect(assistant?.toolEvents?.[0]?.status).toBe("started");
  });

  it("enriches create_task via a registry push that arrives AFTER the tool_use line was parsed — the ordering fix", async () => {
    const toolResults = new ChatToolResultRegistry();
    const target: TaskTarget = { kind: "pipeline", id: "delivery", name: "Delivery" };
    const svc = new TestSession(
      store,
      events,
      [
        line({ type: "system", subtype: "init", session_id: "s" }),
        line({
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: "toolu_4",
                name: "mcp__zibby__create_task",
                input: { text: "postav X" },
              },
            ],
          },
        }),
        line({ type: "result", is_error: false, result: "Jdu na to." }),
      ],
      "jarvis",
      toolResults,
    );
    const id = await store.ensureConversation("c4");

    // Reproduces the real production ordering: the "started" announcement for the
    // tool_use block goes out BEFORE any structured result exists in the registry —
    // the MCP handler (chat-mcp.controller) only pushes it once create_task has
    // actually finished executing. Nothing is pre-filled before the turn starts;
    // the push happens off the live "started" frame instead, exactly like the real
    // handler reacting after the stream has already announced the dispatch.
    const sub = events.stream().subscribe((e) => {
      if (e.type === "tool" && e.tool.name === "create_task" && e.tool.status === "started") {
        toolResults.pushCreateTaskResult(id, { runRef: "delivery_1", taskId: "task-9", target });
      }
    });
    await svc.runTurn(id, "turn-4", "postav X", NOW);
    sub.unsubscribe();

    const toolFrames = seen.filter((e) => e.type === "tool");
    expect(toolFrames).toHaveLength(2);
    const [started, ok] = toolFrames;
    expect(started && started.type === "tool" && started.tool.status).toBe("started");
    expect(ok && ok.type === "tool" && ok.tool.status).toBe("ok");
    // Same callId correlates the pair.
    const callId = started && started.type === "tool" ? started.tool.callId : undefined;
    expect(callId).toBe("toolu_4");
    expect(ok && ok.type === "tool" && ok.tool.callId).toBe(callId);
    expect(ok && ok.type === "tool" && ok.tool.href).toBe("/archiv?run=delivery_1");
    expect(ok && ok.type === "tool" && ok.tool.runRef).toBe("delivery_1");
    expect(ok && ok.type === "tool" && ok.tool.taskId).toBe("task-9");
    expect(ok && ok.type === "tool" && ok.tool.target).toEqual(target);
    expect(ok && ok.type === "tool" && ok.tool.summary).toContain("Delivery");

    // The persisted transcript collapses the started→ok pair to ONE entry, not two.
    const assistant = (await store.readTranscript(id)).messages.find((m) => m.role === "assistant");
    expect(assistant?.toolEvents).toHaveLength(1);
    expect(assistant?.toolEvents?.[0]?.status).toBe("ok");
    expect(assistant?.toolEvents?.[0]?.runRef).toBe("delivery_1");
  });

  it("turn-end sweep pairs a leftover queued create_task result that had no live subscriber to receive it", async () => {
    const toolResults = new ChatToolResultRegistry();
    const target: TaskTarget = { kind: "agent", id: "builder", name: "Builder" };
    const svc = new TestSession(
      store,
      events,
      [
        line({ type: "system", subtype: "init", session_id: "s" }),
        line({
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: "toolu_5",
                name: "mcp__zibby__create_task",
                input: { text: "postav X" },
              },
            ],
          },
        }),
        line({ type: "result", is_error: false, result: "Jdu na to." }),
      ],
      "jarvis",
      toolResults,
    );
    const id = await store.ensureConversation("c5");
    // Queued BEFORE the turn starts — so before `runTurn` ever subscribes — which is
    // the one case that still goes through the FIFO queue instead of a live push.
    // The turn-end sweep (not the live-push path) is what pairs and delivers it.
    toolResults.pushCreateTaskResult(id, { runRef: "delivery_2", taskId: "task-10", target });
    await svc.runTurn(id, "turn-5", "postav X", NOW);

    const toolFrames = seen.filter((e) => e.type === "tool");
    expect(toolFrames).toHaveLength(2);
    const ok = toolFrames[1];
    expect(ok && ok.type === "tool" && ok.tool.status).toBe("ok");
    expect(ok && ok.type === "tool" && ok.tool.callId).toBe("toolu_5");
    expect(ok && ok.type === "tool" && ok.tool.runRef).toBe("delivery_2");

    const assistant = (await store.readTranscript(id)).messages.find((m) => m.role === "assistant");
    expect(assistant?.toolEvents).toHaveLength(1);
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

  describe("explicit @mention target (Fáze 14.2)", () => {
    const target: TaskTarget = { kind: "agent", id: "builder", name: "Builder" };

    it("sendMessage stores body.target in the registry before the turn starts", async () => {
      const toolResults = new ChatToolResultRegistry();
      const svc = new TestSession(
        store,
        events,
        [
          line({ type: "system", subtype: "init", session_id: "s" }),
          line({ type: "result", is_error: false, result: "ok" }),
        ],
        "jarvis",
        toolResults,
      );
      const result = await svc.sendMessage(
        { conversationId: "c6", text: "postav appku", target },
        NOW,
      );
      // Set synchronously, before the fire-and-forget turn even runs.
      expect(toolResults.getExplicitTarget(result.conversationId)).toEqual(target);
      await settled(result.turnId);
    });

    it("adds an explicit-target line to the turn's system prompt and clears it once the turn ends", async () => {
      const toolResults = new ChatToolResultRegistry();
      const svc = new TestSession(
        store,
        events,
        [
          line({ type: "system", subtype: "init", session_id: "s" }),
          line({ type: "result", is_error: false, result: "ok" }),
        ],
        "jarvis",
        toolResults,
      );
      const result = await svc.sendMessage(
        { conversationId: "c7", text: "postav appku", target },
        NOW,
      );
      await settled(result.turnId);

      const prompt = svc.lastArgs[svc.lastArgs.indexOf("--append-system-prompt") + 1] ?? "";
      expect(prompt).toContain("Builder");
      expect(prompt).toContain("@mention");
      // One-shot per turn: cleared once the turn settles (done/error).
      expect(toolResults.getExplicitTarget(result.conversationId)).toBeUndefined();
    });

    it("builds no explicit-target line when nothing was mentioned", async () => {
      const svc = new TestSession(store, events, []);
      const args = await svc.buildArgs("ahoj", null, "c8");
      const prompt = args[args.indexOf("--append-system-prompt") + 1] ?? "";
      expect(prompt).not.toContain("@mention");
    });
  });

  describe("MCP config auth (T9 — bearer token off argv)", () => {
    it("the spilled --mcp-config FILE carries the Authorization: Bearer header", async () => {
      const mcpAuth = new ChatMcpAuthService();
      const svc = new TestSession(
        store,
        events,
        [],
        "jarvis",
        new ChatToolResultRegistry(),
        mcpAuth,
        dir,
      );
      const args = await svc.buildArgs("ahoj", null, "c9");

      const configPath = args[args.indexOf("--mcp-config") + 1] ?? "";
      const config = JSON.parse(await fs.readFile(configPath, "utf8"));
      expect(config.mcpServers.zibby.headers.Authorization).toBe(`Bearer ${mcpAuth.bearerToken}`);
    });

    it("the raw token never appears literally in the returned argv array", async () => {
      const mcpAuth = new ChatMcpAuthService();
      const svc = new TestSession(
        store,
        events,
        [],
        "jarvis",
        new ChatToolResultRegistry(),
        mcpAuth,
        dir,
      );
      const args = await svc.buildArgs("ahoj", null, "c10");

      expect(args.some((arg) => arg.includes(mcpAuth.bearerToken))).toBe(false);
    });

    it("the spilled config file is written mode 0600 (owner-only, secret-bearing)", async () => {
      const mcpAuth = new ChatMcpAuthService();
      const svc = new TestSession(
        store,
        events,
        [],
        "jarvis",
        new ChatToolResultRegistry(),
        mcpAuth,
        dir,
      );
      const args = await svc.buildArgs("ahoj", null, "c11");

      const configPath = args[args.indexOf("--mcp-config") + 1] ?? "";
      const stat = await fs.stat(configPath);
      expect(stat.mode & 0o777).toBe(0o600);
    });
  });
});
