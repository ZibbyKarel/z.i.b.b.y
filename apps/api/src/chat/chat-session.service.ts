import { type ChildProcess, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  type Attachment,
  type ChatMentionTarget,
  type ChatMessage,
  type ChatToolEvent,
  type SendChatMessageBody,
  type SendChatMessageResult,
  type TaskTarget,
} from "@zibby/contracts";
import { CompaniesStorageService } from "../companies/companies.storage.service";
import { KbMcpAuthService } from "../kb/kb-mcp-auth.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { SkillsStorageService } from "../skills/skills.storage.service";
import { collisionResistantId, ensureDir } from "../shared/file-storage";
import { SystemConfigStore } from "../system/system-config.store";
import { AttachmentStorageService } from "../tasks/attachment-storage.service";
import { buildAttachmentPromptSection } from "./chat-attachment-prompt";
import { ChatEventsService } from "./chat-events.service";
import { ChatMcpAuthService } from "./chat-mcp-auth.service";
import { buildChatPrompt } from "./chat-persona";
import { type ChatStreamEvent, parseChatStreamLine } from "./chat-stream-parser";
import { type ChatCreateTaskMeta, ChatToolResultRegistry } from "./chat-tool-result.registry";
import { describeTarget } from "./chat-tools.service";
import { CHAT_DIR, ChatTranscriptStore } from "./chat-transcript.store";

/** Minimal shape of the spawned `claude` process — the test seam overrides this. */
export interface ClaudeProcess {
  stdout: NodeJS.ReadableStream | null;
  on(event: "close", cb: (code: number | null) => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  kill(signal?: NodeJS.Signals): boolean;
}

/** TODO 13 — the resolved `#project` / `#company` / `/skill` tags of one turn. */
export interface ChatTurnTags {
  skill?: { name: string; instructions: string };
  project?: { id: string; name: string; path?: string };
  company?: { id: string; name: string };
}

/** Hard ceiling on one turn; a stuck `claude` is killed and the turn ends in error. */
const TURN_TIMEOUT_MS = 120_000;

/** D-020 — the only kinds a chat `@mention` may carry (mirrors `ChatMentionTargetSchema`);
 *  narrows the legacy, broader `SendChatMessageBody.target` before folding it into
 *  `mentions`, which the contract types strictly. */
function isChatMentionTarget(target: TaskTarget): target is ChatMentionTarget {
  return target.kind === "agent" || target.kind === "workflow" || target.kind === "department";
}

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
    private readonly mcpAuth: ChatMcpAuthService,
    @Inject(CHAT_DIR) private readonly chatDir: string,
    // Task 8: the KB auth service's CHAT token (never the run token — see
    // `kbMcpUrl`/`toolArgs`'s docblocks) for the `zibby-kb` MCP server this
    // service also mounts.
    private readonly kbMcpAuth: KbMcpAuthService,
    // D-020: resolves a turn's `attachmentSetId` into its metadata (for the
    // persisted `ChatMessage.attachments`) and reads the files themselves off
    // disk (for the prompt's inline text section) — the same store the task
    // composer's upload already writes to (no second upload path).
    private readonly attachmentStorage: AttachmentStorageService,
    // TODO 13: resolve the `/skill`, `#project` and `#company` tags of a turn.
    private readonly skills: SkillsStorageService,
    private readonly projects: ProjectsStorageService,
    private readonly companies: CompaniesStorageService,
  ) {}

  /**
   * Append the operator's turn and kick off the streaming assistant response. Returns
   * immediately with `{ conversationId, turnId }`; tokens arrive on the SSE stream.
   *
   * D-020: `body.mentions` (0–8 units) is the normalised form of "who the operator
   * addressed"; the legacy single `body.target` (Fáze 14.2) is folded into it here —
   * `mentions ?? (target ? [target] : [])` — so every downstream reader (the registry,
   * `create_task`'s routing rule, the persisted transcript) only ever has to look at
   * ONE list. Both the mentions and any `body.attachmentSetId` are held in the
   * tool-result registry BEFORE the turn starts, so `create_task` can read them, and
   * the prompt built in `buildArgs` can tell the model who was addressed and what was
   * attached.
   */
  async sendMessage(
    body: SendChatMessageBody,
    now: Date = new Date(),
  ): Promise<SendChatMessageResult> {
    // TODO 13: resolve every tag BEFORE anything is written — an unknown id must fail
    // the request (404 in ChatController) without minting a conversation or leaving an
    // orphan user turn.
    const [skill, project, company] = await Promise.all([
      body.skillId ? this.skills.get(body.skillId) : undefined,
      body.projectId ? this.projects.get(body.projectId) : undefined,
      body.companyId ? this.companies.get(body.companyId) : undefined,
    ]);
    const tags: ChatTurnTags = {
      ...(skill
        ? { skill: { name: skill.name ?? skill.id, instructions: skill.instructions } }
        : {}),
      ...(project ? { project: { id: project.id, name: project.name, path: project.path } } : {}),
      ...(company ? { company: { id: company.id, name: company.name } } : {}),
    };
    // A tagged project scopes the KB to its own team unless a team is tagged explicitly.
    const teamId = body.teamId ?? project?.teamId;
    const conversationId = await this.store.ensureConversation(body.conversationId, now);
    const mentions: ChatMentionTarget[] =
      body.mentions ?? (body.target && isChatMentionTarget(body.target) ? [body.target] : []);
    if (mentions.length > 0) {
      this.toolResults.setMentions(conversationId, mentions);
      // Kept for the single-mention case: every existing reader of the (older,
      // singular) explicit target keeps working unchanged.
      if (mentions.length === 1 && mentions[0]) {
        this.toolResults.setExplicitTarget(conversationId, mentions[0]);
      }
    }
    let attachments: Attachment[] = [];
    if (body.attachmentSetId) {
      this.toolResults.setAttachmentSetId(conversationId, body.attachmentSetId);
      attachments = await this.attachmentStorage.list(body.attachmentSetId).catch(() => []);
    }
    const userMessage: ChatMessage = {
      id: collisionResistantId("msg"),
      role: "user",
      text: body.text,
      at: now.toISOString(),
      ...(mentions.length > 0 ? { mentions } : {}),
      ...(attachments.length > 0 ? { attachments, attachmentSetId: body.attachmentSetId } : {}),
    };
    await this.store.appendMessage(conversationId, userMessage);

    const turnId = collisionResistantId("turn");
    // Fire-and-forget: the turn streams over SSE and persists itself. Failures are
    // surfaced as an `error` turn event and logged, never thrown at the caller.
    // `now` is passed explicitly as `undefined` so `runTurn` keeps minting its OWN
    // fresh timestamp (unchanged behaviour) while `body.teamId` threads through as
    // the turn's KB scope tag — Task 8, mirrors how `conversationId` already threads.
    void this.runTurn(conversationId, turnId, body.text, undefined, teamId, tags).catch((error) => {
      this.logger.error(`chat turn ${turnId} failed: ${String(error)}`);
      this.events.emit({ conversationId, turnId, type: "error", message: "Něco se pokazilo." });
    });

    return { conversationId, turnId };
  }

  /** Build the verified CLI argument vector for one turn. Exposed for the args test.
   * Async since {@link toolArgs} spills the `--mcp-config` (now secret-bearing —
   * see its docblock) to a file before returning the path. */
  async buildArgs(
    text: string,
    sessionId: string | null,
    conversationId: string,
    teamId?: string,
    tags?: ChatTurnTags,
  ): Promise<string[]> {
    const mentions = this.toolResults.getMentions(conversationId);
    const persona = buildChatPrompt(this.systemConfig.current().chatPersona);
    // D-020: when the operator @mentioned one or more units, tell the model plainly —
    // it still decides WHETHER to call `create_task` (rule 3 of the governor), but if
    // it does, routing is already decided (mentions skip the classifier server-side).
    // With a SINGLE mention it's exactly the Fáze 14.2 line; with several the model is
    // told it must pass `mention` (`create_task`'s optional arg) naming which one.
    const mentionLine =
      mentions.length === 1 && mentions[0]
        ? `Operátor v této zprávě výslovně oslovil ${describeTarget(mentions[0])} (@mention). ` +
          "Pokud zavoláš create_task, tato volba už má přednost před klasifikací — nemusíš " +
          "znovu vybírat cíl."
        : mentions.length > 1
          ? `Operátor v této zprávě výslovně oslovil více jednotek: ${mentions
              .map((m) => `${describeTarget(m)} (id: ${"id" in m ? m.id : m.kind})`)
              .join(", ")}. Pokud zavoláš create_task pro některou z nich, MUSÍŠ zadat ` +
            "argument mention s jejím id — bez něj nebo s jiným id volání skončí chybou. " +
            "Můžeš create_task zavolat i vícekrát, jednou pro každou oslovenou jednotku."
          : undefined;

    const attachmentSetId = this.toolResults.getAttachmentSetId(conversationId);
    const attachments = attachmentSetId
      ? await this.attachmentStorage.list(attachmentSetId).catch(() => [])
      : [];
    const attachmentSection =
      attachments.length > 0 && attachmentSetId
        ? await buildAttachmentPromptSection(
            attachments,
            this.attachmentStorage.dir(attachmentSetId),
          )
        : undefined;

    const scopeParts = [
      tags?.company ? `firmu "${tags.company.name}" (id: ${tags.company.id})` : undefined,
      tags?.project
        ? `projekt "${tags.project.name}" (id: ${tags.project.id}${tags.project.path ? `, cesta: ${tags.project.path}` : ""})`
        : undefined,
    ].filter(Boolean);
    const scopeLine =
      scopeParts.length > 0
        ? `Operátor tuto zprávu vztáhl k: ${scopeParts.join(", ")} (#tag). Odpovídej v jeho kontextu; ` +
          "pokud zavoláš create_task pro projekt, předej jeho cestu v argumentu paths."
        : undefined;
    const skillSection = tags?.skill
      ? `Operátor pro tuto zprávu vybral skill "${tags.skill.name}" (/skill). Řiď se jeho instrukcemi — ` +
        `doplňují pravidla výše, nikdy je nenahrazují:\n\n${tags.skill.instructions}`
      : undefined;
    const prompt = [persona, mentionLine, scopeLine, attachmentSection, skillSection]
      .filter(Boolean)
      .join("\n\n");
    const args = [
      "-p",
      text,
      "--setting-sources",
      "",
      // Disable ALL built-in tools (Bash/Write/Edit/…). ZIBBY chat is a conversational
      // butler, not a coding agent: its only way to ACT is the `zibby` MCP tools
      // (create_task delegates real work to the workflow). Without this the model
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
    args.push(...(await this.toolArgs(conversationId, teamId)));
    return args;
  }

  /** The base URL the spawned `claude` reaches the in-process MCP server at, scoped to
   * this conversation so the (stateless, one-request-per-call) MCP controller can queue
   * `create_task` results and read the explicit target for the right conversation. */
  protected mcpBaseUrl(conversationId: string): string {
    const base = process.env.ZIBBY_API_BASE ?? `http://localhost:${process.env.PORT ?? 3333}`;
    return `${base}/api/chat/mcp?conversationId=${encodeURIComponent(conversationId)}`;
  }

  /** The base URL the spawned `claude` reaches the `zibby-kb` MCP server at
   * (Task 8) — mirrors {@link mcpBaseUrl}'s shape. `teamId` (the operator's
   * `@`-mention tag for this turn) rides as the `?teamId=` query param, exactly
   * like `conversationId` does above, and is OMITTED entirely when the turn
   * carries no tag — `KbMcpController` reads its absence as "no ceiling", not
   * as an empty-string team id. */
  protected kbMcpUrl(teamId?: string): string {
    const base = process.env.ZIBBY_API_BASE ?? `http://localhost:${process.env.PORT ?? 3333}`;
    const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
    return `${base}/api/kb/mcp${query}`;
  }

  /**
   * MCP tool wiring (`--mcp-config` + `--allowedTools`): point the turn at the
   * in-process HTTP MCP server (server id `zibby`), carrying the per-boot bearer
   * token (see {@link ChatMcpAuthService}) the new {@link ChatMcpAuthGuard} requires,
   * and allow its six tools. The CLI round-trips tool-use against this under the
   * verified chat spawn config.
   *
   * Task 8 adds a SECOND server entry, `zibby-kb` — the load-bearing part of that
   * task: without it, `KbScopeService.rootsForChat` is unreachable dead code and a
   * chat turn can never read any team's knowledge base, no matter how the KB
   * endpoint itself is guarded/scoped. It carries the KB auth service's **chat**
   * token (`KbMcpAuthService.chatBearerToken`) — never the run token, and never
   * `ChatMcpAuthService.bearerToken` (that's the unrelated `zibby` server's own
   * guard). The token is what `KbMcpAuthGuard` uses to decide the caller path
   * (`req.kbCaller`), NOT the presence of `X-Zibby-Run-Id` — see
   * `KbMcpAuthService`'s and `KbMcpController`'s class docs for the full
   * rationale and the four-row truth table this depends on.
   *
   * The token must never land on argv (`ps`-visible to any local user — the exact
   * bug class T5c/`68de5655` fixed for the runner's `--mcp-config`, which this
   * service's inline-JSON shape had NOT yet picked up). So the whole config —
   * including BOTH servers' `Authorization: Bearer …` headers — is spilled to a
   * `0600` file under the chat dir (`resolveChatDir()`, gitignored) and passed as
   * `--mcp-config <path>`; only the file PATH goes on argv. A fresh, collision-safe
   * filename per call (mirrors the runner's `buildMcpConfigArgs`, minus a shared
   * per-run sandbox dir chat doesn't have) — left on disk after the turn (chat has
   * no per-run cleanup sweep; the file carries no secret usable outside this boot
   * and sits mode-0600 in a gitignored dir).
   *
   * `--allowedTools` widens to cover both servers (`mcp__zibby__*,mcp__zibby-kb__*`).
   * Per commit `eb525567`, this list is a PROMPTING hint, not a toolset filter — a
   * tool left off it still exists and still executes — so what actually makes the
   * KB tools reachable at all is the `mcpServers` entry above, not this list.
   */
  protected async toolArgs(conversationId: string, teamId?: string): Promise<string[]> {
    const config = {
      mcpServers: {
        zibby: {
          type: "http",
          url: this.mcpBaseUrl(conversationId),
          headers: { Authorization: `Bearer ${this.mcpAuth.bearerToken}` },
        },
        "zibby-kb": {
          type: "http",
          url: this.kbMcpUrl(teamId),
          headers: { Authorization: `Bearer ${this.kbMcpAuth.chatBearerToken}` },
        },
      },
    };
    await ensureDir(this.chatDir);
    const file = path.join(this.chatDir, `${collisionResistantId("mcp-config")}.json`);
    await fs.writeFile(file, JSON.stringify(config), { mode: 0o600 });
    return ["--mcp-config", file, "--allowedTools", "mcp__zibby__*,mcp__zibby-kb__*"];
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
    // Task 8: the operator's `@`-mention team tag for this turn, threaded straight
    // through into `buildArgs` → `toolArgs` → `kbMcpUrl` — the same explicit-parameter
    // threading `conversationId` already gets, not new registry state.
    teamId?: string,
    tags?: ChatTurnTags,
  ): Promise<void> {
    const sessionId = await this.store.getSessionId(conversationId);
    const proc = this.createProcess(
      await this.buildArgs(text, sessionId, conversationId, teamId, tags),
    );

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
        // F8d (D17): `/archiv` replaced `/runs` as the task archive — stop minting
        // new `/runs` links. `/runs` itself stays a redirect shim (preserving
        // `?run=`) so already-persisted transcript JSONL carrying the old href
        // still lands on the right run; this is the one live call site that used
        // to mint it, so from here on every NEW event points straight at `/archiv`.
        href: result.runRef ? `/archiv?run=${result.runRef}` : "/archiv",
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

    // The @mention target(s) and any attachment set (if any) are one-shot per turn —
    // discard them now so nothing stale leaks into the conversation's next turn.
    this.toolResults.clearExplicitTarget(conversationId);
    this.toolResults.clearMentions(conversationId);
    this.toolResults.clearAttachmentSetId(conversationId);

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
