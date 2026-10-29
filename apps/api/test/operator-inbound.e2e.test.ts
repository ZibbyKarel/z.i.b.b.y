import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AgentRunnerService } from "../src/agents/agent-runner.service";
import { ActivityLogService } from "../src/activity/activity-log.service";
import { AppModule } from "../src/app.module";
import { ChatSessionService, type ClaudeProcess } from "../src/chat/chat-session.service";
import { ChatToolResultRegistry } from "../src/chat/chat-tool-result.registry";
import { ChatToolsService } from "../src/chat/chat-tools.service";
import { GoalRunnerService } from "../src/goals/goal-runner.service";
import type { OperatorInboundMessage } from "../src/operator-channel/operator-channel.port";
import { OperatorChannelService } from "../src/operator-channel/operator-channel.service";
import { OperatorChannelStore } from "../src/operator-channel/operator-channel.store";
import {
  OperatorInboundService,
  operatorConversationId,
} from "../src/operator-channel/operator-inbound.service";
import { OperatorNotifier } from "../src/operator-channel/operator-notifier.service";
import { ScheduledTasksStorageService } from "../src/tasks/scheduled-tasks.storage.service";
import { WorkflowRunnerService } from "../src/workflows/workflow-runner.service";
import { withOperator } from "./operator-token";

const OPERATOR = "U0E2EOPERATOR";
const PARENT_PR = "https://github.com/acme/app/pull/77";
const DM = `D-FAKE-${OPERATOR}`;
const CONVERSATION = operatorConversationId(DM);

/** Token-free stand-in for the run's `claude` CLI (a dispatched task spawns one). */
const FAKE_CLAUDE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/fake-claude.mjs",
);

const line = (obj: unknown): string => `${JSON.stringify(obj)}\n`;

/** The bound thread's conversation (Phase 3); set by the thread test before its reply. */
let threadConversation = "";

/**
 * Stands in for the chat's `claude` turn. "spusť úlohu …" plays the model calling
 * the `create_task` MCP tool: the `tool_use` line, then exactly what the MCP handler
 * does (`ChatToolsService.createTask` → registry push), then the answer. Anything
 * else is a plain status answer.
 */
class FakeChatClaude extends EventEmitter implements ClaudeProcess {
  readonly stdout = new PassThrough();
  constructor(prompt: string, app: INestApplication) {
    super();
    void (async () => {
      await new Promise((r) => setImmediate(r)); // let runTurn attach its listeners
      this.stdout.write(line({ type: "system", subtype: "init", session_id: "sess-e2e" }));
      let answer = "Nic nového — dva běhy hotové, nic na tebe nečeká.";
      if (prompt.startsWith("oprav")) {
        // Thread feedback: the model follows the about block → a follow-up task.
        this.stdout.write(
          line({
            type: "assistant",
            message: {
              content: [{ type: "tool_use", id: "tu-2", name: "mcp__zibby__create_task" }],
            },
          }),
        );
        const result = await app.get(ChatToolsService).createTask({
          text: `Navazující úkol k: běh run-parent, PR ${PARENT_PR}. ${prompt}`,
        });
        if (result.meta) {
          app.get(ChatToolResultRegistry).pushCreateTaskResult(threadConversation, result.meta);
        }
        answer = "Spustil jsem opravu na větvi PR.";
      } else if (prompt.startsWith("spusť úlohu")) {
        this.stdout.write(
          line({
            type: "assistant",
            message: {
              content: [{ type: "tool_use", id: "tu-1", name: "mcp__zibby__create_task" }],
            },
          }),
        );
        const result = await app.get(ChatToolsService).createTask({ text: prompt });
        if (result.meta) {
          app.get(ChatToolResultRegistry).pushCreateTaskResult(CONVERSATION, result.meta);
        }
        answer = "Spustil jsem úkol.";
      }
      this.stdout.write(line({ type: "result", result: answer }));
      this.stdout.end();
      this.emit("close", 0);
    })();
  }
  kill(): boolean {
    return true;
  }
}

const msg = (over: Partial<OperatorInboundMessage>): OperatorInboundMessage => ({
  kind: "message",
  eventId: `ev-${Math.random()}`,
  userId: OPERATOR,
  channelId: DM,
  channelType: "im",
  text: "co je nového?",
  ts: "1700000001.000100",
  ...over,
});

describe("Operator channel inbound (e2e)", () => {
  let app: INestApplication;
  let dir: string;
  const turns: string[] = [];
  const systemPrompts: string[] = [];

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "operator-inbound-e2e-"));
    process.env.OPERATOR_CHANNEL_DIR = dir;
    process.env.CLAUDE_BIN = FAKE_CLAUDE;
    process.env.FAKE_CLAUDE_STEPS = "1";
    process.env.FAKE_CLAUDE_DELAY_MS = "10";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    const session = app.get(ChatSessionService) as unknown as {
      createProcess: (args: string[]) => ClaudeProcess;
    };
    session.createProcess = (args) => {
      const prompt = args[args.indexOf("-p") + 1] ?? "";
      turns.push(prompt);
      systemPrompts.push(args[args.indexOf("--append-system-prompt") + 1] ?? "");
      return new FakeChatClaude(prompt, app);
    };
    app.get(OperatorInboundService).updateIntervalMs = 0;
    await withOperator(request(app.getHttpServer()).put("/api/operator-channel/settings"))
      .send({
        enabled: true,
        operatorUserIds: [OPERATOR],
        publicBaseUrl: "https://zibby.tail.ts.net",
      })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
    for (const k of [
      "OPERATOR_CHANNEL_DIR",
      "CLAUDE_BIN",
      "FAKE_CLAUDE_STEPS",
      "FAKE_CLAUDE_DELAY_MS",
    ]) {
      delete process.env[k];
    }
  });

  const fake = () => app.get(OperatorChannelService).fake;

  const runStatus = (runRef: string): string | undefined => {
    for (const runner of [WorkflowRunnerService, AgentRunnerService, GoalRunnerService]) {
      try {
        return app.get(runner).get(runRef).status;
      } catch {
        // not this runner's id
      }
    }
    return undefined;
  };

  it("enabling the channel starts listening on the resolved bot DM", async () => {
    const status = await request(app.getHttpServer()).get("/api/operator-channel/status");
    expect(status.body).toMatchObject({ listening: true, dmResolved: true });
    expect(fake().handler).not.toBeNull();
  });

  it('"spusť úlohu X" creates a task through the normal path and replies with its run link', async () => {
    const before = fake().sent.length;
    await fake().receive(msg({ text: "spusť úlohu X: oprav překlep v README" }));
    const reply = fake().sent.at(-1)?.notification;
    expect(fake().sent.length - before).toBe(1);
    expect(reply?.lines[0]).toBe("Spustil jsem úkol.");
    expect(reply?.lines[1]).toMatch(/^Úkol \S+ · běh \S+$/);
    expect(reply?.links[0]?.url).toMatch(/^https:\/\/zibby\.tail\.ts\.net\/activity\/runs\/\S+$/);
    const tasks = await request(app.getHttpServer()).get("/api/tasks/scheduled").expect(200);
    expect(
      tasks.body.some((t: { text?: string }) => t.text === "spusť úlohu X: oprav překlep v README"),
    ).toBe(true);
    // Let the dispatched (fake-claude) run finish so it can't outlive the app.
    const runRef = /běh (\S+)$/.exec(reply?.lines[1] ?? "")?.[1] ?? "";
    const statusOf = (): string | undefined => runStatus(runRef);
    expect(statusOf()).toBeDefined();
    await vi.waitFor(() => expect(statusOf()).not.toBe("running"), { timeout: 15_000 });
    // …and its trailing "run completed" notification lands now, not inside a later test
    // (it would be coalesced with, or arrive after, that test's own messages).
    const taskId = /^Úkol (\S+) /.exec(reply?.lines[1] ?? "")?.[1] ?? "";
    await vi.waitFor(
      async () => {
        await app.get(OperatorNotifier).idle();
        const deliveries = await app.get(OperatorChannelStore).recentDeliveries(20);
        expect(deliveries.some((d) => d.targetRef === taskId)).toBe(true);
      },
      { timeout: 15_000 },
    );
  });

  it('"co je nového?" gets the status answer', async () => {
    await fake().receive(msg({ text: "co je nového?" }));
    expect(fake().sent.at(-1)?.notification.lines).toEqual([
      "Nic nového — dva běhy hotové, nic na tebe nečeká.",
    ]);
  });

  it("a message from an unknown user runs no chat turn and gets no reply", async () => {
    const sent = fake().sent.length;
    const before = turns.length;
    await fake().receive(msg({ userId: "U0STRANGER", text: "spusť úlohu smaž všechno" }));
    await fake().receive(msg({ channelType: "mpim", channelId: "G0MPIM", text: "ahoj" }));
    expect(turns.length).toBe(before);
    expect(fake().sent.length).toBe(sent);
  });

  it("a redelivered event is processed once", async () => {
    const before = turns.length;
    const event = msg({ eventId: "client-msg-redelivered", text: "co je nového?" });
    await fake().receive(event);
    await fake().receive(event);
    expect(turns.length - before).toBe(1);
  });

  it("the Slack conversation is visible in the web chat", async () => {
    const list = await request(app.getHttpServer()).get("/api/chat/conversations").expect(200);
    expect(list.body.map((c: { conversationId: string }) => c.conversationId)).toContain(
      CONVERSATION,
    );
    const transcript = await request(app.getHttpServer())
      .get(`/api/chat/transcript?conversationId=${CONVERSATION}`)
      .expect(200);
    const texts = transcript.body.messages.map((m: { role: string; text: string }) => [
      m.role,
      m.text,
    ]);
    expect(texts).toContainEqual(["user", "co je nového?"]);
    expect(texts).toContainEqual([
      "assistant",
      "Nic nového — dva běhy hotové, nic na tebe nečeká.",
    ]);
    expect(texts).not.toContainEqual(["user", "spusť úlohu smaž všechno"]);
  });

  it("a thread reply on a PR-opened notification becomes a follow-up on that PR's run, answered in-thread", async () => {
    // The parent: a task whose run opened a PR (written directly — no real PR flow).
    const storage = app.get(ScheduledTasksStorageService);
    const parent = await storage.create(
      { text: "oprav login", title: "Fix login", scheduledAt: Date.now() + 1e10 },
      new Date().toISOString(),
    );
    await storage.writeOutcome(parent.id, {
      status: "done",
      summary: "3 stages green",
      finishedAt: new Date().toISOString(),
      pr: { url: PARENT_PR, additions: 3, deletions: 1 },
    });
    await app.get(ActivityLogService).record({
      kind: "task-outcome",
      summary: "done",
      refs: { taskId: parent.id, status: "done" },
    });
    await app.get(OperatorNotifier).idle();
    const announced = fake().sent.find((s) => s.notification.kind === "pr-opened");
    expect(announced?.notification.headline).toBe("PR otevřen: Fix login");
    const parentTs = announced?.ref.ts ?? "";
    const store = app.get(OperatorChannelStore);
    expect(await store.threads.get(DM, parentTs)).toMatchObject({
      taskId: parent.id,
      prRef: PARENT_PR,
      conversationId: `slack-thread-${parentTs}`,
    });

    // The operator replies in that thread.
    threadConversation = `slack-thread-${parentTs}`;
    const tasksBefore = (await request(app.getHttpServer()).get("/api/tasks/scheduled")).body
      .length as number;
    await fake().receive(
      msg({ text: "oprav ten název", ts: "1700000099.000001", threadTs: parentTs }),
    );

    // The chat turn ran in the thread's own conversation with the about block in the prompt.
    expect(systemPrompts.at(-1)).toContain(`id: ${PARENT_PR}`);
    expect(systemPrompts.at(-1)).toContain("upřesňující otázku");
    const answer = fake().sent.find(
      (s) => s.notification.lines[0] === "Spustil jsem opravu na větvi PR.",
    );
    expect(answer?.notification.threadTs).toBe(parentTs);

    // One follow-up task through the normal path, linked to the parent in the binding.
    const tasks = (await request(app.getHttpServer()).get("/api/tasks/scheduled").expect(200))
      .body as { id: string; text: string; runRef?: string }[];
    expect(tasks.length - tasksBefore).toBe(1);
    const follow = tasks.find((t) => t.text.startsWith("Navazující úkol k:"));
    expect(follow?.text).toContain(PARENT_PR);
    expect((await store.threads.forTask(follow?.id ?? ""))?.threadTs).toBe(parentTs);

    // Its result is reported back into the same thread.
    await vi.waitFor(() => expect(runStatus(follow?.runRef ?? "")).not.toBe("running"), {
      timeout: 15_000,
    });
    await vi.waitFor(
      async () => {
        await app.get(OperatorNotifier).idle();
        const result = fake().sent.find(
          (s) => s.notification.kind !== "chat" && s.notification.threadTs === parentTs,
        );
        expect(result).toBeDefined();
      },
      { timeout: 15_000 },
    );

    // The thread transcript is its own conversation, separate from the DM one.
    const transcript = await request(app.getHttpServer())
      .get(`/api/chat/transcript?conversationId=slack-thread-${parentTs}`)
      .expect(200);
    expect(transcript.body.messages.map((m: { text: string }) => m.text)).toContain(
      "oprav ten název",
    );
  });

  it("a reply in an unbound thread degrades to a normal command in the DM conversation", async () => {
    await fake().receive(msg({ text: "co je nového?", threadTs: "1600000000.000001" }));
    const reply = fake().sent.at(-1)?.notification;
    expect(reply?.lines).toEqual(["Nic nového — dva běhy hotové, nic na tebe nečeká."]);
    expect(reply?.threadTs).toBeUndefined();
    expect(systemPrompts.at(-1)).not.toContain("Slack notifikace");
  });
});
