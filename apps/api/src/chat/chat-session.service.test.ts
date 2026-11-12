import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { promises as fs, readFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatPersona, ChatToolEvent, SystemConfig, TaskTarget } from "@zibby/contracts";
import { clearOpencodeCache } from "../runner/ai-engine";
import type { AgentsStorageService } from "../agents/agents.storage.service";
import { CompanyNotFoundError } from "../companies/companies.errors";
import type { CompaniesStorageService } from "../companies/companies.storage.service";
import type { OperatorMcpServer } from "../inventory/operator-mcp-servers";
import { KbMcpAuthService } from "../kb/kb-mcp-auth.service";
import { ProjectNotFoundError } from "../projects/projects.errors";
import type { ProjectsStorageService } from "../projects/projects.storage.service";
import { SkillNotFoundError } from "../skills/skills.errors";
import { TeamNotFoundError } from "../teams/teams.errors";
import type { TeamsStorageService } from "../teams/teams.storage.service";
import type { SkillsStorageService } from "../skills/skills.storage.service";
import { fakeSystemConfigStore } from "../system/system-config.fixture";
import { AttachmentStorageService } from "../tasks/attachment-storage.service";
import { CHAT_GOVERNOR_PROMPT, CHAT_PERSONAS } from "./chat-persona";
import { ChatEventsService, type ChatTurnEvent } from "./chat-events.service";
import { ChatMcpAuthService } from "./chat-mcp-auth.service";
import {
  ChatSessionService,
  type ChatSpawnOptions,
  type ClaudeProcess,
  killTurnProcess,
  mergeToolEvent,
} from "./chat-session.service";
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
  lastCwd: string | undefined;
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
    // D-020: a fresh in-memory store by default — a test asserting attachment
    // handling constructs its own and pre-seeds it (see the "attachments" block).
    attachmentStorage: AttachmentStorageService = new AttachmentStorageService(),
    // TODO 13: tag resolvers — by default every id is unknown.
    skills: Pick<SkillsStorageService, "get"> = {
      get: async (id) => {
        throw new SkillNotFoundError(id);
      },
    },
    projects: Pick<ProjectsStorageService, "get" | "list"> = {
      get: async (id) => {
        throw new ProjectNotFoundError(id);
      },
      list: async () => [],
    },
    companies: Pick<CompaniesStorageService, "get"> = {
      get: async (id) => {
        throw new CompanyNotFoundError(id);
      },
    },
    // Teams the legacy KB-scope tests tag; any other id is unknown.
    teams: Pick<TeamsStorageService, "get"> = {
      get: async (id) => {
        if (id === "devrel" || id === "platform") return { id, name: id };
        throw new TeamNotFoundError(id);
      },
    },
    agents: Pick<AgentsStorageService, "get"> = {
      get: async (id) => {
        throw new Error(`unknown agent ${id}`);
      },
    },
    // A24: engine settings (`aiEngine`, `opencodeTierModels`, …).
    config: Partial<SystemConfig> = {},
  ) {
    super(
      store,
      events,
      fakeSystemConfigStore({ chatPersona: persona, ...config }),
      toolResults,
      mcpAuth,
      chatDir,
      kbMcpAuth,
      attachmentStorage,
      skills as SkillsStorageService,
      projects as ProjectsStorageService,
      companies as CompaniesStorageService,
      teams as TeamsStorageService,
      agents as AgentsStorageService,
    );
  }
  lastSpawn: ChatSpawnOptions | undefined;
  /** The turn's `--mcp-config` as it was at spawn — the file is gone once the turn ends. */
  lastMcpConfig: { mcpServers: Record<string, { url: string }> } | undefined;
  /** Set to make the next spawn throw (spawn failure). */
  spawnError: Error | undefined;
  /** A33: the operator's own MCP servers an opencode turn reads (never the real ~/.claude). */
  operatorServers: OperatorMcpServer[] = [];
  /** The opencode turn's config as it was at spawn — the file is gone once the turn ends. */
  lastOpencodeConfig: Record<string, unknown> | undefined;
  protected operatorMcpServers(): Promise<OperatorMcpServer[]> {
    return Promise.resolve(this.operatorServers);
  }
  protected createProcess(args: string[], cwd?: string, opts?: ChatSpawnOptions): ClaudeProcess {
    this.lastArgs = args;
    this.lastCwd = cwd;
    this.lastSpawn = opts;
    const ocConfig = opts?.env?.OPENCODE_CONFIG;
    if (ocConfig) this.lastOpencodeConfig = JSON.parse(readFileSync(ocConfig, "utf8"));
    const mcpConfig = args.indexOf("--mcp-config");
    if (mcpConfig !== -1) {
      this.lastMcpConfig = JSON.parse(readFileSync(args[mcpConfig + 1] ?? "", "utf8"));
    }
    if (this.spawnError) throw this.spawnError;
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
      summary: "Spustil jsem úkol — workflow Delivery.",
      href: "/activity/runs/r1",
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
    expect(args[args.indexOf("--permission-mode") + 1]).toBe("auto");
    // A30: the operator's user setup (connectors, MCP servers), but no hooks
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("user");
    expect(JSON.parse(args[args.indexOf("--settings") + 1] ?? "")).toEqual({
      disableAllHooks: true,
    });
    // built-in tools hidden via a denylist — `--tools` would also drop claude.ai connectors
    expect(args).not.toContain("--tools");
    const hidden = (args[args.indexOf("--disallowedTools") + 1] ?? "").split(",");
    expect(hidden).toEqual(expect.arrayContaining(["Read", "Write", "Edit", "Grep"]));
    // Bash is the operator's call: chat gets a shell, allowed without a prompt.
    expect(hidden).not.toContain("Bash");
    expect((args[args.indexOf("--allowedTools") + 1] ?? "").split(",")).toContain("Bash");
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
    const allowed = (args[args.indexOf("--allowedTools") + 1] ?? "").split(",");
    expect(allowed.slice(0, 3)).toEqual(["Bash", "mcp__zibby__*", "mcp__zibby-kb__*"]);
    // claude.ai Slack connector: read + draft only, never send.
    expect(allowed).toContain("mcp__claude_ai_Slack__slack_search_public_and_private");
    expect(allowed).toContain("mcp__claude_ai_Slack__slack_send_message_draft");
    expect(allowed).not.toContain("mcp__claude_ai_Slack__slack_send_message");
    expect(allowed).not.toContain("mcp__claude_ai_Slack__*");
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

      expect(svc.lastMcpConfig?.mcpServers["zibby-kb"]?.url).toMatch(
        /\/api\/kb\/mcp\?teamId=devrel$/,
      );
    });

    it("mounts no ?teamId= at all when sendMessage's body carries none", async () => {
      const svc = new TestSession(store, events, [
        line({ type: "system", subtype: "init", session_id: "s" }),
        line({ type: "result", is_error: false, result: "ok" }),
      ]);
      const result = await svc.sendMessage({ conversationId: "c-team-2", text: "ahoj" }, NOW);
      await settled(result.turnId);

      expect(svc.lastMcpConfig?.mcpServers["zibby-kb"]?.url).toMatch(/\/api\/kb\/mcp$/);
      expect(svc.lastMcpConfig?.mcpServers["zibby-kb"]?.url).not.toContain("?");
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
    const target: TaskTarget = { kind: "workflow", id: "delivery", name: "Delivery" };
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
    expect(ok && ok.type === "tool" && ok.tool.href).toBe("/activity/runs/delivery_1");
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

  describe("D-020 — mentions + attachments", () => {
    const agent: TaskTarget = { kind: "agent", id: "builder", name: "Builder" };
    const dept: TaskTarget = { kind: "department", id: "dev", name: "Dev" };
    const workflow: TaskTarget = { kind: "workflow", id: "delivery", name: "Delivery" };

    it("normalises mentions ?? (target ? [target] : []) and persists mentions on the user message", async () => {
      const svc = new TestSession(store, events, [
        line({ type: "system", subtype: "init", session_id: "s" }),
        line({ type: "result", is_error: false, result: "ok" }),
      ]);
      const result = await svc.sendMessage(
        { conversationId: "c-mention-1", text: "postav appku", target: agent },
        NOW,
      );
      await settled(result.turnId);
      const transcript = await store.readTranscript(result.conversationId);
      expect(transcript.messages[0]?.mentions).toEqual([agent]);
    });

    it("runs a single @agent mention inline: agent prompt + model, read tools only, no create_task", async () => {
      const builder = {
        id: "builder",
        instructions: "Jsi Builder, piš krátce.",
        model: "opus",
        tools: ["Read", "Write", "Bash"],
      };
      const svc = new TestSession(
        store,
        events,
        [],
        "jarvis",
        new ChatToolResultRegistry(),
        new ChatMcpAuthService(),
        os.tmpdir(),
        new KbMcpAuthService(),
        new AttachmentStorageService(),
        undefined,
        undefined,
        undefined,
        undefined,
        { get: async () => builder } as never,
      );
      svc["toolResults"].setMentions("c-agent", [agent as never]);
      const args = await svc.buildArgs("ahoj", null, "c-agent");
      const prompt = args[args.indexOf("--append-system-prompt") + 1] ?? "";
      const denied = (args[args.indexOf("--disallowedTools") + 1] ?? "").split(",");
      expect(prompt).toContain("Jsi Builder");
      expect(prompt).toContain("přes @builder");
      expect(prompt).not.toContain("JEDNEJ");
      expect(args[args.indexOf("--model") + 1]).toBe("opus");
      expect(denied).toContain("mcp__zibby__create_task");
      expect(denied).toContain("Write");
      expect(denied).not.toContain("Read");
    });

    it("carries an explicit multi-mention list straight through, without folding in `target`", async () => {
      const svc = new TestSession(store, events, [
        line({ type: "system", subtype: "init", session_id: "s" }),
        line({ type: "result", is_error: false, result: "ok" }),
      ]);
      const result = await svc.sendMessage(
        { conversationId: "c-mention-2", text: "rozděl to", mentions: [agent, dept] },
        NOW,
      );
      await settled(result.turnId);
      const transcript = await store.readTranscript(result.conversationId);
      expect(transcript.messages[0]?.mentions).toEqual([agent, dept]);
    });

    it("adds a plural mention line to the prompt, naming every unit and requiring `mention`", async () => {
      const svc = new TestSession(store, events, [
        line({ type: "system", subtype: "init", session_id: "s" }),
        line({ type: "result", is_error: false, result: "ok" }),
      ]);
      const result = await svc.sendMessage(
        { conversationId: "c-mention-3", text: "rozděl to", mentions: [agent, workflow] },
        NOW,
      );
      await settled(result.turnId);
      const prompt = svc.lastArgs[svc.lastArgs.indexOf("--append-system-prompt") + 1] ?? "";
      expect(prompt).toContain("Builder");
      expect(prompt).toContain("Delivery");
      expect(prompt).toContain("mention");
    });

    it("resolves body.attachmentSetId's metadata onto the persisted user message", async () => {
      const attachmentStorage = new AttachmentStorageService();
      const { attachmentSetId } = await attachmentStorage.save([
        { originalname: "a.txt", size: 5, mimetype: "text/plain", buffer: Buffer.from("hello") },
      ]);
      const svc = new TestSession(
        store,
        events,
        [
          line({ type: "system", subtype: "init", session_id: "s" }),
          line({ type: "result", is_error: false, result: "ok" }),
        ],
        "jarvis",
        new ChatToolResultRegistry(),
        undefined,
        os.tmpdir(),
        undefined,
        attachmentStorage,
      );
      const result = await svc.sendMessage(
        { conversationId: "c-attach-1", text: "zkontroluj přílohu", attachmentSetId },
        NOW,
      );
      await settled(result.turnId);
      const transcript = await store.readTranscript(result.conversationId);
      expect(transcript.messages[0]?.attachmentSetId).toBe(attachmentSetId);
      expect(transcript.messages[0]?.attachments).toEqual([
        { name: "a.txt", size: 5, mediaType: "text/plain" },
      ]);
      await attachmentStorage.remove(attachmentSetId);
    });

    it("inlines the attachment's text content into the turn's system prompt", async () => {
      const attachmentStorage = new AttachmentStorageService();
      const { attachmentSetId } = await attachmentStorage.save([
        {
          originalname: "notes.txt",
          size: 9,
          mimetype: "text/plain",
          buffer: Buffer.from("obsah dat"),
        },
      ]);
      const svc = new TestSession(
        store,
        events,
        [
          line({ type: "system", subtype: "init", session_id: "s" }),
          line({ type: "result", is_error: false, result: "ok" }),
        ],
        "jarvis",
        new ChatToolResultRegistry(),
        undefined,
        os.tmpdir(),
        undefined,
        attachmentStorage,
      );
      const result = await svc.sendMessage(
        { conversationId: "c-attach-2", text: "co je v souboru?", attachmentSetId },
        NOW,
      );
      await settled(result.turnId);
      const prompt = svc.lastArgs[svc.lastArgs.indexOf("--append-system-prompt") + 1] ?? "";
      expect(prompt).toContain("obsah dat");
      expect(prompt).toContain("notes.txt");
      await attachmentStorage.remove(attachmentSetId);
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

    const turnLines = [
      line({ type: "system", subtype: "init", session_id: "s" }),
      line({ type: "result", is_error: false, result: "ok" }),
    ];
    const configOf = (svc: TestSession): string =>
      svc.lastArgs[svc.lastArgs.indexOf("--mcp-config") + 1] ?? "";

    it("deletes the turn's --mcp-config file once the turn ends", async () => {
      const svc = new TestSession(store, events, turnLines, "jarvis", undefined, undefined, dir);
      const r = await svc.sendMessage({ conversationId: "c-rm", text: "ahoj" }, NOW);
      await settled(r.turnId);
      expect(svc.lastMcpConfig?.mcpServers.zibby).toBeDefined();
      await expect(fs.access(configOf(svc))).rejects.toThrow();
    });

    it("deletes it on an errored turn and when the spawn itself throws", async () => {
      const errored = new TestSession(
        store,
        events,
        [line({ type: "result", is_error: true, result: "boom" })],
        "jarvis",
        undefined,
        undefined,
        dir,
      );
      const r = await errored.sendMessage({ conversationId: "c-rm2", text: "ahoj" }, NOW);
      await settled(r.turnId);
      await expect(fs.access(configOf(errored))).rejects.toThrow();

      const failing = new TestSession(store, events, [], "jarvis", undefined, undefined, dir);
      failing.spawnError = new Error("spawn EACCES");
      const r2 = await failing.sendMessage({ conversationId: "c-rm3", text: "ahoj" }, NOW);
      await settled(r2.turnId);
      expect(failing.lastMcpConfig).toBeDefined();
      await expect(fs.access(configOf(failing))).rejects.toThrow();
    });

    it("sweeps stale per-turn configs at start, keeping fresh ones and transcripts", async () => {
      const old = new Date(Date.now() - 10 * 60_000);
      const stale = ["mcp-config_1_abc123.json", "opencode-chat_1_def456.json"];
      for (const name of [...stale, "mcp-config_2_aaa111.json", "c1.jsonl"]) {
        await fs.writeFile(path.join(dir, name), "{}");
      }
      for (const name of [...stale, "c1.jsonl"]) await fs.utimes(path.join(dir, name), old, old);
      await new TestSession(store, events, [], "jarvis", undefined, undefined, dir).onModuleInit();
      expect((await fs.readdir(dir)).sort()).toEqual(["c1.jsonl", "mcp-config_2_aaa111.json"]);
    });
  });

  describe("killTurnProcess", () => {
    it("SIGTERMs, then SIGKILLs after the grace (no pid → the child itself)", () => {
      vi.useFakeTimers();
      try {
        const signals: (string | undefined)[] = [];
        killTurnProcess({
          stdout: null,
          on: () => undefined,
          kill: (sig) => (signals.push(sig), true),
        });
        expect(signals).toEqual(["SIGTERM"]);
        vi.advanceTimersByTime(3_000);
        expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("kills the whole detached group, even a grandchild that ignores SIGTERM", async () => {
      // `trap "" TERM` is inherited by the backgrounded `sleep`: only SIGKILL ends it.
      const child = spawn("sh", ["-c", 'trap "" TERM; sleep 60 & echo $!; wait'], {
        detached: true,
        stdio: ["ignore", "pipe", "ignore"],
      });
      const grandchild = Number(
        await new Promise<string>((resolve) => child.stdout.once("data", (d) => resolve(`${d}`))),
      );
      const alive = (pid: number): boolean => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      };
      killTurnProcess(child);
      await new Promise((r) => setTimeout(r, 500));
      expect(alive(grandchild)).toBe(true); // SIGTERM ignored
      await new Promise((r) => setTimeout(r, 3_000));
      expect(alive(grandchild)).toBe(false);
    }, 10_000);
  });
  describe("TODO 13 — # and / tags", () => {
    const skills = {
      get: async () => ({ id: "review", name: "Review", instructions: "Check every diff twice." }),
    } as unknown as Pick<SkillsStorageService, "get">;
    const projects = {
      get: async (id: string) => {
        if (id !== "shop") throw new ProjectNotFoundError(id);
        return { id: "shop", name: "Shop", path: "/w/shop", teamId: "devrel" };
      },
      list: async () => [],
    } as unknown as Pick<ProjectsStorageService, "get" | "list">;
    const companies = {
      get: async (id: string) => {
        if (id !== "acme") throw new CompanyNotFoundError(id);
        return { id: "acme", name: "Acme" };
      },
    } as unknown as Pick<CompaniesStorageService, "get">;

    const make = () =>
      new TestSession(
        store,
        events,
        [],
        "jarvis",
        undefined,
        undefined,
        dir,
        undefined,
        undefined,
        skills,
        projects,
        companies,
      );
    const promptOf = (svc: TestSession): string =>
      svc.lastArgs[svc.lastArgs.indexOf("--append-system-prompt") + 1] ?? "";
    const kbUrlOf = async (svc: TestSession): Promise<string> =>
      svc.lastMcpConfig?.mcpServers["zibby-kb"]?.url ?? "";

    it("runs a turn about a GitHub PR inside the project whose gitRemote is that repo", async () => {
      const cms4 = {
        id: "cms4",
        name: "cms4",
        gitRemote: "git@github.com:shoptet/cms4.git",
        path: "/w/cms4",
      };
      const svc = new TestSession(
        store,
        events,
        [],
        "jarvis",
        undefined,
        undefined,
        dir,
        undefined,
        undefined,
        skills,
        {
          get: projects.get,
          list: async () => [cms4],
        } as unknown as Pick<ProjectsStorageService, "get" | "list">,
      );
      const result = await svc.sendMessage(
        {
          text: "go",
          about: {
            kind: "pr",
            id: "pr",
            label: "PR #1",
            href: "https://github.com/shoptet/cms4/pull/1",
          },
        },
        NOW,
      );
      await settled(result.turnId);
      expect(svc.lastCwd).toBe("/w/cms4");
      expect(promptOf(svc)).toContain("cesta: /w/cms4");
    });

    it("appends a /-picked skill's instructions after the governor", async () => {
      const svc = make();
      const result = await svc.sendMessage({ text: "go", skillId: "review" }, NOW);
      await settled(result.turnId);
      const prompt = promptOf(svc);
      expect(prompt.indexOf(CHAT_GOVERNOR_PROMPT.slice(0, 40))).toBeGreaterThanOrEqual(0);
      expect(prompt.indexOf(CHAT_GOVERNOR_PROMPT.slice(0, 40))).toBeLessThan(
        prompt.indexOf("Check every diff twice."),
      );
      expect(prompt).toContain('skill "Review"');
    });

    it("names a #-tagged project and company and scopes the KB to the project's team", async () => {
      const svc = make();
      const result = await svc.sendMessage(
        { text: "go", projectId: "shop", companyId: "acme" },
        NOW,
      );
      await settled(result.turnId);
      const prompt = promptOf(svc);
      expect(prompt).toContain('projekt "Shop"');
      expect(prompt).toContain("/w/shop");
      expect(prompt).toContain('firmu "Acme"');
      expect(await kbUrlOf(svc)).toMatch(/\?teamId=devrel$/);
    });

    it("an explicit teamId still wins over the project's team", async () => {
      const svc = make();
      const result = await svc.sendMessage(
        { text: "go", projectId: "shop", teamId: "platform" },
        NOW,
      );
      await settled(result.turnId);
      expect(await kbUrlOf(svc)).toMatch(/\?teamId=platform$/);
    });

    it.each([
      ["skillId", "nope", SkillNotFoundError],
      ["projectId", "nope", ProjectNotFoundError],
      ["companyId", "nope", CompanyNotFoundError],
      ["teamId", "nope", TeamNotFoundError],
    ])("rejects an unknown %s before writing anything", async (key, value, errorClass) => {
      const svc = new TestSession(store, events, []);
      await expect(svc.sendMessage({ text: "go", [key]: value }, NOW)).rejects.toBeInstanceOf(
        errorClass,
      );
      expect(await store.listConversationIds()).toEqual([]);
    });
  });

  describe("todo-29 — about", () => {
    const promptOf = (args: string[]): string =>
      args[args.indexOf("--append-system-prompt") + 1] ?? "";
    const about = { kind: "pr", id: "u", label: "PR #1", details: "big" };

    it("adds an about data block to the prompt only when about is given", async () => {
      const svc = new TestSession(store, events, [], "jarvis");
      const withAbout = await svc.buildArgs("ahoj", null, "c1", undefined, { about });
      expect(promptOf(withAbout)).toContain("<about-");
      expect(promptOf(withAbout)).toContain("label: PR #1");
      expect(promptOf(await svc.buildArgs("ahoj", null, "c1"))).not.toContain("<about-");
    });

    it("persists the about ref without details and passes the full about to the turn", async () => {
      const svc = new TestSession(store, events, [], "jarvis");
      const result = await svc.sendMessage({ text: "go", about }, NOW);
      await settled(result.turnId);
      const user = (await store.readTranscript(result.conversationId)).messages.find(
        (m) => m.role === "user",
      );
      expect(user?.about).toEqual({ kind: "pr", id: "u", label: "PR #1" });
      const prompt = promptOf(svc.lastArgs);
      const block = prompt.slice(prompt.indexOf("<about-"), prompt.lastIndexOf("</about-"));
      expect(block).toContain("big");
    });
  });

  describe("todo-30 — chat model", () => {
    const modelOf = (args: string[]): string | undefined => args[args.indexOf("--model") + 1];
    const delta = (text: string): string =>
      line({
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "text_delta", text } },
      });
    const assistantOf = async (conversationId: string) =>
      (await store.readTranscript(conversationId)).messages.find((m) => m.role === "assistant");

    it("uses the tagged model for --model, falling back to the default", async () => {
      const svc = new TestSession(store, events, []);
      expect(modelOf(await svc.buildArgs("ahoj", null, "c1", undefined, { model: "fable" }))).toBe(
        "fable",
      );
      expect(modelOf(await svc.buildArgs("ahoj", null, "c1"))).toBe("sonnet");
      const resumed = await svc.buildArgs("ahoj", "sess-1", "c1", undefined, { model: "opus" });
      expect(resumed[resumed.indexOf("--resume") + 1]).toBe("sess-1");
      expect(modelOf(resumed)).toBe("opus");
    });

    it("stamps the assistant message with the turn's model", async () => {
      const lines = [
        line({ type: "system", subtype: "init", session_id: "s" }),
        delta("Ahoj"),
        line({ type: "result", is_error: false, result: "Ahoj" }),
      ];
      const picked = new TestSession(store, events, lines);
      const r1 = await picked.sendMessage(
        { conversationId: "c-m1", text: "go", model: "haiku" },
        NOW,
      );
      await settled(r1.turnId);
      expect((await assistantOf(r1.conversationId))?.model).toBe("haiku");
      const plain = new TestSession(store, events, lines);
      const r2 = await plain.sendMessage({ conversationId: "c-m2", text: "go" }, NOW);
      await settled(r2.turnId);
      expect((await assistantOf(r2.conversationId))?.model).toBe("sonnet");
    });

    it("stamps a partial turn (text then error) too", async () => {
      const svc = new TestSession(store, events, [
        line({ type: "system", subtype: "init", session_id: "s" }),
        delta("Půl odpovědi"),
        line({ type: "result", is_error: true, result: "boom" }),
      ]);
      const r = await svc.sendMessage({ text: "go", model: "opus" }, NOW);
      await settled(r.turnId);
      const msg = await assistantOf(r.conversationId);
      expect(msg?.text).toContain("Půl odpovědi");
      expect(msg?.model).toBe("opus");
    });
  });
  describe("A30 — the operator's setup from user settings", () => {
    it("the --mcp-config carries ZibbyOS's own servers only (operator servers load natively)", async () => {
      const svc = new TestSession(store, events, [], "jarvis", undefined, undefined, dir);
      const args = await svc.buildArgs("ahoj", null, "c1");
      const config = JSON.parse(
        await fs.readFile(args[args.indexOf("--mcp-config") + 1] ?? "", "utf8"),
      );
      expect(Object.keys(config.mcpServers).sort()).toEqual(["zibby", "zibby-kb"]);
    });

    it("the real spawn switches off CLAUDE.md files and auto-memory", async () => {
      const bin = path.join(dir, "claude");
      await fs.writeFile(
        bin,
        '#!/bin/sh\necho "$CLAUDE_CODE_DISABLE_CLAUDE_MDS $CLAUDE_CODE_DISABLE_AUTO_MEMORY"\n',
        { mode: 0o755 },
      );
      const previous = process.env.CLAUDE_BIN;
      process.env.CLAUDE_BIN = bin;
      try {
        const svc = new TestSession(store, events, []);
        const realSpawn = (
          ChatSessionService.prototype as unknown as { createProcess(a: string[]): ClaudeProcess }
        ).createProcess;
        const proc = realSpawn.call(svc, []);
        let out = "";
        proc.stdout?.on("data", (chunk: Buffer) => (out += chunk.toString()));
        await new Promise<void>((resolve) => proc.on("close", () => resolve()));
        expect(out.trim()).toBe("1 1");
      } finally {
        if (previous === undefined) delete process.env.CLAUDE_BIN;
        else process.env.CLAUDE_BIN = previous;
      }
    });
  });

  describe("A24 — chat on opencode", () => {
    let bin: string;
    const OPENCODE = {
      aiEngine: "opencode",
      opencodeTierModels: { haiku: "opencode/test-free" },
    } as const;
    const ocLines = (sessionID: string, text: string) => [
      line({ type: "step_start", sessionID, part: { type: "step-start" } }),
      line({
        type: "tool_use",
        sessionID,
        part: {
          id: "call_1",
          tool: "zibby_recall_memory",
          state: { status: "completed", input: {}, output: "ok" },
        },
      }),
      line({
        type: "tool_use",
        sessionID,
        part: { id: "call_2", tool: "shell", state: { status: "error", input: { command: "ls" } } },
      }),
      line({ type: "text", sessionID, part: { type: "text", text } }),
      line({ type: "text", sessionID, part: { type: "text", text: "Druhý blok." } }),
      line({ type: "step_finish", sessionID, part: { cost: 0 } }),
    ];

    beforeEach(async () => {
      // `opencode models` for the A7 preflight.
      bin = path.join(dir, "opencode");
      await fs.writeFile(bin, "#!/bin/sh\necho opencode/test-free\n", { mode: 0o755 });
      process.env.OPENCODE_BIN = bin;
      clearOpencodeCache();
    });
    afterEach(() => {
      delete process.env.OPENCODE_BIN;
      clearOpencodeCache();
    });

    const opencodeSession = (lines: string[], config: Partial<SystemConfig> = OPENCODE) =>
      new TestSession(
        store,
        events,
        lines,
        "jarvis",
        undefined,
        undefined,
        dir,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        config,
      );

    it("runs the turn on opencode with the tier's model, maps events, records the engine", async () => {
      const svc = opencodeSession(ocLines("ses_1", "Ahoj z opencode."));
      const r = await svc.sendMessage(
        { conversationId: "c-oc", text: "ahoj", model: "sonnet" },
        NOW,
      );
      await settled(r.turnId);
      expect(svc.lastSpawn?.command).toBe(bin);
      const args = svc.lastArgs;
      expect(args.slice(0, 4)).toEqual(["run", "--standalone", "--format", "json"]);
      // sonnet has no mapping → nearest lower mapped tier (haiku).
      expect(args[args.indexOf("-m") + 1]).toBe("opencode/test-free");
      expect(args).not.toContain("--session");
      expect(args).not.toContain("--auto");
      expect(args.at(-1)).toBe("ahoj");
      // A33: the OAuth remotes + ZibbyOS's own servers (no operator servers in this test).
      expect(svc.lastSpawn?.env.ZIBBY_CHAT_MCP_SERVERS).toBe("atlassian,figma,zibby,zibby-kb");
      expect(svc.lastSpawn?.env.ZIBBY_CHAT_DENY_TOOLS).toBe("");
      // The 0600 config (bearer tokens) is gone once the turn ends.
      await expect(fs.access(svc.lastSpawn?.env.OPENCODE_CONFIG ?? "")).rejects.toThrow();

      const transcript = await store.readTranscript(r.conversationId);
      expect(transcript.sessionId).toBe("ses_1");
      expect(transcript.sessionEngine).toBe("opencode");
      const msg = transcript.messages.find((m) => m.role === "assistant");
      expect(msg?.text).toBe("Ahoj z opencode.\n\nDruhý blok.");
      expect(msg).toMatchObject({
        model: "sonnet",
        engine: "opencode",
        engineModel: "opencode/test-free",
      });
      expect(msg?.toolEvents).toEqual([
        { name: "recall_memory", status: "ok" },
        { name: "shell", status: "error", callId: "call_2" },
      ]);
    });

    it("mounts the operator's servers (minus serena) and the OAuth remotes; own servers can't be shadowed (A33)", async () => {
      const svc = opencodeSession(ocLines("ses_m", "Hotovo."));
      svc.operatorServers = [
        { id: "serena", config: { type: "stdio", command: "serena" } },
        { id: "plugin_context7_context7", config: { type: "http", url: "https://ctx7/mcp" } },
        { id: "zibby", config: { type: "http", url: "https://shadow" } },
      ];
      const r = await svc.sendMessage({ conversationId: "c-ops", text: "ahoj" }, NOW);
      await settled(r.turnId);
      expect(svc.lastSpawn?.env.ZIBBY_CHAT_MCP_SERVERS).toBe(
        "atlassian,figma,plugin_context7_context7,zibby,zibby-kb",
      );
      const servers = (svc.lastOpencodeConfig?.mcp as { servers: Record<string, unknown> }).servers;
      expect(servers.serena).toBeUndefined();
      // OAuth stays on for a header-less remote (operator logs in once, A33)…
      expect(servers.atlassian).toEqual({
        type: "remote",
        url: "https://mcp.atlassian.com/v1/mcp",
        codemode: false,
      });
      expect(servers.plugin_context7_context7).toMatchObject({ url: "https://ctx7/mcp" });
      // …and ZibbyOS's own bearer-token server wins its name, OAuth off.
      expect(servers.zibby).toMatchObject({ type: "remote", oauth: false });
      expect((servers.zibby as { url: string }).url).toContain("/api/chat/mcp");
    });

    it("resumes its own session with --session", async () => {
      await store.setSessionId("c-oc2", "ses_prev", NOW, "opencode");
      const svc = opencodeSession(ocLines("ses_prev", "Pokračuji."));
      const r = await svc.sendMessage({ conversationId: "c-oc2", text: "dál" }, NOW);
      await settled(r.turnId);
      expect(svc.lastArgs[svc.lastArgs.indexOf("--session") + 1]).toBe("ses_prev");
    });

    it("starts fresh when the stored session belongs to the other engine", async () => {
      await store.setSessionId("c-mix", "claude-sess", NOW); // claude (default)
      const svc = opencodeSession(ocLines("ses_new", "Nová session."));
      const r = await svc.sendMessage({ conversationId: "c-mix", text: "ahoj" }, NOW);
      await settled(r.turnId);
      expect(svc.lastArgs).not.toContain("--session");
      expect(await store.getSession("c-mix")).toEqual({ sessionId: "ses_new", engine: "opencode" });

      // …and back on claude the opencode session id is not passed to --resume.
      const claude = new TestSession(store, events, [
        line({ type: "system", subtype: "init", session_id: "claude-2" }),
        line({ type: "result", is_error: false, result: "ok" }),
      ]);
      const r2 = await claude.sendMessage({ conversationId: "c-mix", text: "zpět" }, NOW);
      await settled(r2.turnId);
      expect(claude.lastSpawn).toBeUndefined();
      expect(claude.lastArgs).not.toContain("--resume");
    });

    it("fails the turn with opencode's reason when it is unusable — no Claude fallback (A7)", async () => {
      // No model anywhere (A31 defaults filled in by the fixture are cleared).
      const svc = opencodeSession([], {
        aiEngine: "opencode",
        opencodeModel: "",
        opencodeTierModels: {},
      });
      const r = await svc.sendMessage({ conversationId: "c-x", text: "ahoj" }, NOW);
      await settled(r.turnId);
      expect(svc.lastArgs).toEqual([]);
      const error = seen.find((e) => e.turnId === r.turnId && e.type === "error");
      expect(error && "message" in error ? error.message : "").toMatch(
        /opencode unavailable: no model/,
      );
    });

    it("an opencode error line ends the turn with its message", async () => {
      const svc = opencodeSession([
        line({
          type: "error",
          sessionID: "ses_e",
          error: { type: "provider.free-limit", message: "Free usage limit reached." },
        }),
      ]);
      const r = await svc.sendMessage({ conversationId: "c-err", text: "ahoj" }, NOW);
      await settled(r.turnId);
      const error = seen.find((e) => e.turnId === r.turnId && e.type === "error");
      expect(error && "message" in error ? error.message : "").toBe(
        "opencode: Free usage limit reached.",
      );
    });

    it("an opencode turn with no text, tool or error ends in an error, not an empty reply", async () => {
      const svc = opencodeSession([
        line({ type: "step_start", sessionID: "ses_0", part: { type: "step-start" } }),
      ]);
      const r = await svc.sendMessage({ conversationId: "c-empty", text: "ahoj" }, NOW);
      await settled(r.turnId);
      const error = seen.find((e) => e.turnId === r.turnId && e.type === "error");
      expect(error && "message" in error ? error.message : "").toBe(
        "opencode skončil bez odpovědi.",
      );
      const transcript = await store.readTranscript(r.conversationId);
      expect(transcript.messages.some((m) => m.role === "assistant")).toBe(false);
    });

    it("a mentioned agent's own engine wins over the global one", async () => {
      const agents = {
        get: async () => ({
          id: "builder",
          name: "Builder",
          instructions: "Jsi Builder.",
          engine: "opencode" as const,
          engineModel: "opencode/test-free",
        }),
      };
      const svc = new TestSession(
        store,
        events,
        ocLines("ses_a", "Hotovo."),
        "jarvis",
        undefined,
        undefined,
        dir,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        agents as unknown as Pick<AgentsStorageService, "get">,
      );
      const r = await svc.sendMessage(
        {
          conversationId: "c-ag",
          text: "udělej to",
          mentions: [{ kind: "agent", id: "builder", name: "Builder" }],
        },
        NOW,
      );
      await settled(r.turnId);
      expect(svc.lastSpawn?.command).toBe(bin);
      expect(svc.lastArgs[svc.lastArgs.indexOf("-m") + 1]).toBe("opencode/test-free");
      // An `@agent` turn never spawns a task — the gate plugin denies it too.
      expect(svc.lastSpawn?.env.ZIBBY_CHAT_DENY_TOOLS).toBe("zibby_create_task");
    });
  });
});
