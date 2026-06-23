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
  ) {}

  /**
   * Append the operator's turn and kick off the streaming assistant response. Returns
   * immediately with `{ conversationId, turnId }`; tokens arrive on the SSE stream.
   */
  async sendMessage(body: SendChatMessageBody, now: Date = new Date()): Promise<SendChatMessageResult> {
    const conversationId = await this.store.ensureConversation(body.conversationId, now);
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
  buildArgs(text: string, sessionId: string | null): string[] {
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
      buildChatPrompt(this.systemConfig.current().chatPersona),
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
    args.push(...this.toolArgs());
    return args;
  }

  /** The base URL the spawned `claude` reaches the in-process MCP server at. */
  protected mcpBaseUrl(): string {
    const base = process.env.ZIBBY_API_BASE ?? `http://localhost:${process.env.PORT ?? 3333}`;
    return `${base}/api/chat/mcp`;
  }

  /**
   * MCP tool wiring (`--mcp-config` + `--allowedTools`): point the turn at the
   * in-process HTTP MCP server (server id `zibby`) and allow its three tools. The CLI
   * round-trips tool-use against this under the verified chat spawn config.
   */
  protected toolArgs(): string[] {
    const config = {
      mcpServers: { zibby: { type: "http", url: this.mcpBaseUrl() } },
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
   */
  async runTurn(
    conversationId: string,
    turnId: string,
    text: string,
    now: Date = new Date(),
  ): Promise<void> {
    const sessionId = await this.store.getSessionId(conversationId);
    const proc = this.createProcess(this.buildArgs(text, sessionId));

    let accumulated = "";
    let capturedSession: string | null = null;
    let errored: string | null = null;
    const toolEvents: ChatToolEvent[] = [];

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
          const tool = this.describeTool(event.name);
          toolEvents.push(tool);
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

    if (capturedSession) {
      await this.store.setSessionId(conversationId, capturedSession, now);
    }

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

  /** Map a raw tool name (e.g. `mcp__zibby__create_task`) to its inline announcement. */
  private describeTool(rawName: string): ChatToolEvent {
    const name = rawName.split("__").pop() ?? rawName;
    if (name === "create_task") {
      return { name, status: "ok", summary: "Spustil jsem úkol.", href: "/runs" };
    }
    return { name, status: "ok" };
  }
}
