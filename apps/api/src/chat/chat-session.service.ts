import { type ChildProcess, spawn } from "node:child_process";
import { Injectable, Logger } from "@nestjs/common";
import {
  type ChatMessage,
  type ChatToolEvent,
  type SendChatMessageBody,
  type SendChatMessageResult,
} from "@zibby/contracts";
import { collisionResistantId } from "../shared/file-storage";
import { SystemConfigStore } from "../system/system-config.store";
import { buildChatPrompt } from "./chat-persona";
import { ChatEventsService } from "./chat-events.service";
import { type ChatStreamEvent, parseChatStreamLine } from "./chat-stream-parser";
import { type ChatCreateTaskMeta, ChatToolResultRegistry } from "./chat-tool-result.registry";
import { describeTarget } from "./chat-tools.service";
import { ChatTranscriptStore } from "./chat-transcript.store";

/** Minimal shape of the spawned `claude` process — the test seam overrides this. */
export interface ClaudeProcess {
  stdout: NodeJS.ReadableStream | null;
  on(event: "close", cb: (code: number | null) => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  kill(signal?: NodeJS.Signals): boolean;
}

/** Hard ceiling on one turn; a stuck `claude` is killed and the turn ends in error. */
const TURN_TIMEOUT_MS = 120_000;

/**
 * Merge a newly emitted {@link ChatToolEvent} into the turn's accumulated (and
 * eventually persisted) list. When the event carries a `callId` that matches an
 * existing entry, it REPLACES that entry in place — this is how a `create_task`
 * two-phase dispatch (`started` → `ok`) collapses to a single persisted event
 * instead of leaving both the started and the finished announcement in the
 * transcript. An event without a matching `callId` (no correlation, or the
 * first sighting of one) is appended. Exported for direct unit testing.
 */
export function mergeToolEvent(events: ChatToolEvent[], event: ChatToolEvent): ChatToolEvent[] {
  if (event.callId) {
    const index = events.findIndex((existing) => existing.callId === event.callId);
    if (index !== -1) {
      const next = events.slice();
      next[index] = event;
      return next;
    }
  }
  return [...events, event];
}

/**
 * The conversational engine. One operator message = one streaming `claude` CLI
 * turn (spec §4.1): `claude -p <msg> --resume <sid> --setting-sources ""
 * --append-system-prompt <persona> --output-format stream-json
 * --include-partial-messages --model sonnet`. Token deltas are forwarded live over
 * {@link ChatEventsService}; the finished turn is appended to the JSONL transcript;
 * the threaded session id is persisted for `--resume` on the next turn.
 *
 * `--setting-sources ""` is the isolation mechanism (verified): it loads none of the
 * operator's user/project/local settings — so the global hooks/plugins that would
 * inject foreign context ("You have superpowers") never fire — while keeping auth
 * (the Max subscription, creds in the keychain) and honoring explicit
 * `--append-system-prompt` / `--mcp-config`.
 *
 * Spawning is isolated behind {@link createProcess} so unit tests drive the full
 * turn (parse → emit → persist) with canned CLI lines and never touch a process.
 */
@Injectable()
export class ChatSessionService {
  private readonly logger = new Logger(ChatSessionService.name);
  protected readonly model = process.env.ZIBBY_CHAT_MODEL ?? "sonnet";

  constructor(
    private readonly store: ChatTranscriptStore,
    private readonly events: ChatEventsService,
    private readonly systemConfig: SystemConfigStore,
    private readonly toolResults: ChatToolResultRegistry,
  ) {}

  /**
   * Append the operator's turn and kick off the streaming assistant response. Returns
   * immediately with `{ conversationId, turnId }`; tokens arrive on the SSE stream.
   *
   * `body.target` (Fáze 14.2, the @mention picker) is held in the tool-result registry
   * BEFORE the turn starts, so `create_task` can read it as its explicit target and the
   * prompt built in `buildArgs` can tell the model the operator addressed a specific unit.
   */
  async sendMessage(body: SendChatMessageBody, now: Date = new Date()): Promise<SendChatMessageResult> {
    const conversationId = await this.store.ensureConversation(body.conversationId, now);
    if (body.target) this.toolResults.setExplicitTarget(conversationId, body.target);
    const userMessage: ChatMessage = {
      id: collisionResistantId("msg"),
      role: "user",
      text: body.text,
      at: now.toISOString(),
    };
    await this.store.appendMessage(conversationId, userMessage);

    const turnId = collisionResistantId("turn");
    // Fire-and-forget: the turn streams over SSE and persists itself. Failures are
    // surfaced as an `error` turn event and logged, never thrown at the caller.
    void this.runTurn(conversationId, turnId, body.text).catch((error) => {
      this.logger.error(`chat turn ${turnId} failed: ${String(error)}`);
      this.events.emit({ conversationId, turnId, type: "error", message: "Něco se pokazilo." });
    });

    return { conversationId, turnId };
  }

  /** Build the verified CLI argument vector for one turn. Exposed for the args test. */
  buildArgs(text: string, sessionId: string | null, conversationId: string): string[] {
    const explicitTarget = this.toolResults.getExplicitTarget(conversationId);
    const persona = buildChatPrompt(this.systemConfig.current().chatPersona);
    // Fáze 14.2: when the operator @mentioned a unit, tell the model plainly — it still
    // decides WHETHER to call `create_task` (rule 3 of the governor), but if it does,
    // routing is already decided (`explicitTarget` skips the classifier server-side).
    const prompt = explicitTarget
      ? `${persona}\n\nOperátor v této zprávě výslovně oslovil ${describeTarget(explicitTarget)} ` +
        "(@mention). Pokud zavoláš create_task, tato volba už má přednost před klasifikací — " +
        "nemusíš znovu vybírat cíl."
      : persona;
    const args = [
      "-p",
      text,
      "--setting-sources",
      "",
      // Disable ALL built-in tools (Bash/Write/Edit/…). ZIBBY chat is a conversational
      // butler, not a coding agent: its only way to ACT is the `zibby` MCP tools
      // (create_task delegates real work to the pipeline). Without this the model
      // tries to build things itself with Bash/Write instead of dispatching a task.
      "--tools",
      "",
      // Persona (tone) is operator-selectable and read live from SystemConfig; the
      // answer/ask/act governor inside is constant across personas.
      "--append-system-prompt",
      prompt,
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--verbose",
      "--model",
      this.model,
      "--permission-mode",
      "dontAsk",
    ];
    if (sessionId) args.push("--resume", sessionId);
    args.push(...this.toolArgs(conversationId));
    return args;
  }

  /** The base URL the spawned `claude` reaches the in-process MCP server at, scoped to
   * this conversation so the (stateless, one-request-per-call) MCP controller can queue
   * `create_task` results and read the explicit target for the right conversation. */
  protected mcpBaseUrl(conversationId: string): string {
    const base = process.env.ZIBBY_API_BASE ?? `http://localhost:${process.env.PORT ?? 3333}`;
    return `${base}/api/chat/mcp?conversationId=${encodeURIComponent(conversationId)}`;
  }

  /**
   * MCP tool wiring (`--mcp-config` + `--allowedTools`): point the turn at the
   * in-process HTTP MCP server (server id `zibby`) and allow its three tools. The CLI
   * round-trips tool-use against this under the verified chat spawn config.
   */
  protected toolArgs(conversationId: string): string[] {
    const config = {
      mcpServers: { zibby: { type: "http", url: this.mcpBaseUrl(conversationId) } },
    };
    return ["--mcp-config", JSON.stringify(config), "--allowedTools", "mcp__zibby__*"];
  }

  /** The real spawn; overridden in tests. Isolated stdin, piped stdout/stderr. */
  protected createProcess(args: string[]): ClaudeProcess {
    return spawn(process.env.CLAUDE_BIN ?? "claude", args, {
      stdio: ["ignore", "pipe", "pipe"],
    }) as ChildProcess;
  }

  /**
   * Run one turn end-to-end: spawn, parse the stream line-by-line, emit live events,
   * then persist the assistant message + session id. Resolves when the process ends.
   *
   * Two-phase `create_task` emission (the ordering fix): the `tool_use` stream line
   * always arrives BEFORE the MCP handler has actually run the tool (the CLI emits it
   * as it decides to call the tool, not once the call returns), so an enrichment read
   * at that moment would always see an empty registry. Instead: on the `tool` stream
   * event, emit a `started` announcement immediately and remember its `callId`
   * (`tool_use`'s block id) in arrival order; separately, subscribe to the registry
   * for the conversation's `create_task` results for the duration of the turn — when
   * one is pushed (whenever the MCP handler actually finishes, which races the rest
   * of the stream), pair it with the OLDEST pending callId and emit the enriched `ok`
   * event with the same `callId`. The turn's persisted `toolEvents` collapse the pair
   * into one entry (see {@link mergeToolEvent}) rather than keeping both.
   */
  async runTurn(
    conversationId: string,
    turnId: string,
    text: string,
    now: Date = new Date(),
  ): Promise<void> {
    const sessionId = await this.store.getSessionId(conversationId);
    const proc = this.createProcess(this.buildArgs(text, sessionId, conversationId));

    let accumulated = "";
    let capturedSession: string | null = null;
    let errored: string | null = null;
    let toolEvents: ChatToolEvent[] = [];
    // FIFO of `create_task` callIds awaiting their structured result, in the order
    // their `started` events were emitted.
    const pendingCreateTaskCallIds: string[] = [];

    /** Pair a structured create_task result with the oldest pending callId and emit
     * (+ persist-merge) the enriched `ok` event. Used both for a live push during the
     * turn and for the turn-end sweep of anything left in the fallback queue. */
    const emitCreateTaskOk = (result: ChatCreateTaskMeta): void => {
      const callId = pendingCreateTaskCallIds.shift();
      const tool: ChatToolEvent = {
        name: "create_task",
        status: "ok",
        // `!== undefined` (not truthy) — a shifted "" callId (the parser's fallback
        // for a `tool_use` block with no id) must still round-trip so `mergeToolEvent`
        // can pair it with the started entry that also carries "".
        ...(callId !== undefined ? { callId } : {}),
        summary: `Spustil jsem úkol — ${describeTarget(result.target)}.`,
        href: result.runRef ? `/runs?run=${result.runRef}` : "/runs",
        target: result.target,
        ...(result.runRef ? { runRef: result.runRef } : {}),
        taskId: result.taskId,
      };
      toolEvents = mergeToolEvent(toolEvents, tool);
      this.events.emit({ conversationId, turnId, type: "tool", tool });
    };

    const unsubscribe = this.toolResults.onCreateTaskResult(conversationId, emitCreateTaskOk);

    const apply = (event: ChatStreamEvent): void => {
      switch (event.type) {
        case "session":
          capturedSession = event.sessionId;
          break;
        case "delta":
          accumulated += event.text;
          this.events.emit({ conversationId, turnId, type: "delta", text: event.text });
          break;
        case "tool": {
          const tool = this.describeToolStarted(event.name, event.id);
          if (tool.status === "started") pendingCreateTaskCallIds.push(event.id);
          toolEvents = mergeToolEvent(toolEvents, tool);
          this.events.emit({ conversationId, turnId, type: "tool", tool });
          break;
        }
        case "done":
          if (event.text) accumulated = event.text;
          break;
        case "error":
          errored = event.message;
          break;
      }
    };

    await new Promise<void>((resolve) => {
      let buffer = "";
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        errored = errored ?? "Odpověď trvala příliš dlouho.";
        proc.kill("SIGTERM");
        finish();
      }, TURN_TIMEOUT_MS);
      timer.unref?.();

      const consumeLine = (line: string): void => {
        for (const event of parseChatStreamLine(line)) apply(event);
      };

      proc.stdout?.on("data", (chunk: Buffer | string) => {
        buffer += chunk.toString();
        let newlineAt = buffer.indexOf("\n");
        while (newlineAt !== -1) {
          consumeLine(buffer.slice(0, newlineAt));
          buffer = buffer.slice(newlineAt + 1);
          newlineAt = buffer.indexOf("\n");
        }
      });
      proc.on("error", (err) => {
        errored = errored ?? String(err);
        finish();
      });
      proc.on("close", () => {
        if (buffer.trim()) consumeLine(buffer);
        finish();
      });
    });

    // The turn is over: stop reacting to live pushes, then sweep anything that was
    // queued because it arrived with no subscriber listening (e.g. it landed in the
    // gap after this turn's own subscription above but is only drained now) — each
    // leftover result is still paired with the oldest remaining pending callId. A
    // `started` create_task that never got a result (the tool errored) is left as-is.
    unsubscribe();
    let leftover: ChatCreateTaskMeta | undefined;
    while ((leftover = this.toolResults.drainCreateTaskResult(conversationId))) {
      emitCreateTaskOk(leftover);
    }

    if (capturedSession) {
      await this.store.setSessionId(conversationId, capturedSession, now);
    }

    // The @mention target (if any) is one-shot per turn — discard it now so a stale
    // explicit target never leaks into the conversation's next turn.
    this.toolResults.clearExplicitTarget(conversationId);

    if (errored && !accumulated) {
      this.events.emit({ conversationId, turnId, type: "error", message: errored });
      return;
    }

    const assistant: ChatMessage = {
      id: collisionResistantId("msg"),
      role: "assistant",
      text: accumulated,
      at: now.toISOString(),
      ...(toolEvents.length > 0 ? { toolEvents } : {}),
    };
    await this.store.appendMessage(conversationId, assistant);
    this.events.emit({ conversationId, turnId, type: "done", text: accumulated });
  }

  /**
   * Map a raw tool name (e.g. `mcp__zibby__create_task`) to its FIRST-phase inline
   * announcement, emitted the instant the `tool_use` stream line is parsed (i.e.
   * before the tool has actually run). `create_task` gets a `started` event carrying
   * `callId` — its enrichment (`target`/`runRef`/`taskId`/deep `href`) arrives later
   * as a second, correlated `ok` event once the registry delivers the structured
   * result (see {@link runTurn}'s `emitCreateTaskOk`). Every other tool has no
   * completion signal available to this seam, so it keeps the old single-phase
   * behaviour unchanged: one `ok` event, no `callId`, no regression.
   */
  private describeToolStarted(rawName: string, callId: string): ChatToolEvent {
    const name = rawName.split("__").pop() ?? rawName;
    if (name === "create_task") {
      return { name, status: "started", callId, summary: "Spouštím úkol…" };
    }
    return { name, status: "ok" };
  }
}
