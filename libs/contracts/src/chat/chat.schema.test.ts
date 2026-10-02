import { describe, expect, it } from "vitest";
import type { Briefing } from "../briefing/briefing.schema";
import { TaskTargetSchema } from "../tasks/task.schema";
import {
  ChatMentionTargetSchema,
  ChatMessageSchema,
  ChatToolEventSchema,
  SendChatMessageBodySchema,
} from "./chat.schema";

describe("ChatToolEventSchema.name (T11 finding #7)", () => {
  const base = { name: "create_task", status: "ok" as const };

  it("accepts a well-formed tool event", () => {
    expect(ChatToolEventSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(ChatToolEventSchema.safeParse({ ...base, name: "" }).success).toBe(false);
  });

  it("caps name at 256 chars: 256 passes, 257 rejects", () => {
    expect(ChatToolEventSchema.safeParse({ ...base, name: "x".repeat(256) }).success).toBe(true);
    expect(ChatToolEventSchema.safeParse({ ...base, name: "x".repeat(257) }).success).toBe(false);
  });
});

describe("ChatMessageSchema backward compatibility (F8a — the `briefing` field)", () => {
  // Lines copied verbatim from real, on-disk transcripts under
  // `.zibby/data/chat/*.jsonl` (files are the source of truth) — persisted before
  // the `briefing` field existed. A schema change that fails to parse one of
  // these is data loss, not a styling regression, so this is asserted against the
  // actual bytes rather than a hand-built fixture that could drift from reality.
  const realPlainLine =
    '{"id":"msg_1783429909030_28191c","role":"user","text":"ahoj","at":"2026-07-07T13:11:49.029Z"}';
  const realAssistantLine =
    '{"id":"msg_1783429915455_cc47aa","role":"assistant","text":"Ahoj! Jak se dnes máš? Co pro tebe můžu udělat?","at":"2026-07-07T13:11:49.031Z"}';
  const realToolEventLine =
    '{"id":"msg_1783361336923_4a34df","role":"assistant","text":"Hotovo, pane — poslal jsem to do práce. Hello World pro Test Projekt teď jede přes Delivery workflow (běh `delivery_1783361331762`). Výstupy jako obvykle projdou schvalovací branou, takže se na to mrkněte v běhech, až bude hotovo.","at":"2026-07-06T18:08:26.710Z","toolEvents":[{"name":"create_task","status":"ok","callId":"toolu_01AjeamiYhSG6HHQxzD3waDH","summary":"Spustil jsem úkol — workflow Delivery.","href":"/runs?run=delivery_1783361331762","target":{"kind":"workflow","id":"delivery","name":"Delivery","glyph":"flow"},"runRef":"delivery_1783361331762","taskId":"task_1783361322706_1b5101"}]}';

  it("still parses a real pre-existing user turn (no toolEvents, no briefing)", () => {
    const parsed = ChatMessageSchema.safeParse(JSON.parse(realPlainLine));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.briefing).toBeUndefined();
  });

  it("still parses a real pre-existing assistant turn (no toolEvents, no briefing)", () => {
    const parsed = ChatMessageSchema.safeParse(JSON.parse(realAssistantLine));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.briefing).toBeUndefined();
  });

  it("still parses a real pre-existing create_task toolEvents turn unchanged", () => {
    const parsed = ChatMessageSchema.safeParse(JSON.parse(realToolEventLine));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.briefing).toBeUndefined();
    expect(parsed.data.toolEvents).toHaveLength(1);
    expect(parsed.data.toolEvents?.[0]).toMatchObject({ name: "create_task", status: "ok" });
  });

  it("accepts a new-shape message carrying a briefing payload", () => {
    const briefing: Briefing = {
      generatedAt: "2026-07-19T07:00:00.000Z",
      since: "2026-07-18T07:00:00.000Z",
      headline: "Nothing needs you.",
      nothingNeedsYou: true,
      needsYou: [],
      didForYou: [],
      watching: [],
      engagements: [],
      counts: {
        runsFinished: 0,
        runsFailed: 0,
        parked: 0,
        approvalsPending: 0,
        channelItemsNew: 0,
      },
    };
    const parsed = ChatMessageSchema.safeParse({
      id: "msg_1",
      role: "assistant",
      text: briefing.headline,
      at: briefing.generatedAt,
      briefing,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.briefing?.headline).toBe("Nothing needs you.");
  });
});

describe("SendChatMessageBodySchema.teamId (Task 8 — tag a team on a chat turn)", () => {
  it("carries teamId alongside an explicit target", () => {
    const body = SendChatMessageBodySchema.parse({
      text: "co víme o partner portálu?",
      teamId: "devrel",
    });
    expect(body.teamId).toBe("devrel");
  });

  it("stays valid with no teamId (back-compatible)", () => {
    const body = SendChatMessageBodySchema.parse({ text: "ahoj" });
    expect(body.teamId).toBeUndefined();
  });

  it("rejects a teamId that isn't a valid filename-safe id — proves it's TeamIdSchema, not a bare string", () => {
    const parsed = SendChatMessageBodySchema.safeParse({ text: "x", teamId: "not/a/valid/id" });
    expect(parsed.success).toBe(false);
  });

  it("does not add a team variant to TaskTarget", () => {
    expect(TaskTargetSchema.safeParse({ kind: "team", id: "devrel" }).success).toBe(false);
  });
});

describe("D-020 — chat mentions + attachments", () => {
  const agent = { kind: "agent" as const, id: "builder", name: "Builder" };
  const department = { kind: "department" as const, id: "dev", name: "Dev" };
  const workflow = { kind: "workflow" as const, id: "delivery", name: "Delivery" };

  describe("ChatMentionTargetSchema", () => {
    it.each([agent, department, workflow])("accepts a %s mention", (target) => {
      expect(ChatMentionTargetSchema.safeParse(target).success).toBe(true);
    });

    it("rejects a goal/chain/orchestrator mention — explicit-only kinds stay out of chat", () => {
      expect(
        ChatMentionTargetSchema.safeParse({ kind: "goal", id: "g1", name: "Goal" }).success,
      ).toBe(false);
      expect(
        ChatMentionTargetSchema.safeParse({ kind: "chain", id: "c1", name: "Chain" }).success,
      ).toBe(false);
      expect(
        ChatMentionTargetSchema.safeParse({ kind: "orchestrator", name: "Orchestrator" }).success,
      ).toBe(false);
    });
  });

  describe("SendChatMessageBodySchema.mentions/attachmentSetId", () => {
    it("accepts 0–8 mentions", () => {
      const eight = Array.from({ length: 8 }, (_, i) => ({ ...agent, id: `a${i}` }));
      expect(SendChatMessageBodySchema.safeParse({ text: "x", mentions: [] }).success).toBe(true);
      expect(SendChatMessageBodySchema.safeParse({ text: "x", mentions: eight }).success).toBe(
        true,
      );
    });

    it("rejects a 9th mention", () => {
      const nine = Array.from({ length: 9 }, (_, i) => ({ ...agent, id: `a${i}` }));
      expect(SendChatMessageBodySchema.safeParse({ text: "x", mentions: nine }).success).toBe(
        false,
      );
    });

    it("still accepts the legacy single target with no mentions field", () => {
      const parsed = SendChatMessageBodySchema.safeParse({ text: "x", target: agent });
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.mentions).toBeUndefined();
    });

    it("carries an attachmentSetId alongside mentions", () => {
      const parsed = SendChatMessageBodySchema.safeParse({
        text: "x",
        mentions: [agent],
        attachmentSetId: "set_1",
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.attachmentSetId).toBe("set_1");
    });
  });

  describe("ChatMessageSchema.mentions/attachments/attachmentSetId", () => {
    it("still parses an old-shaped message with none of the three fields", () => {
      const parsed = ChatMessageSchema.safeParse({
        id: "msg_1",
        role: "user",
        text: "ahoj",
        at: "2026-09-27T10:00:00.000Z",
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.mentions).toBeUndefined();
        expect(parsed.data.attachments).toBeUndefined();
        expect(parsed.data.attachmentSetId).toBeUndefined();
      }
    });

    it("parses a new-shaped user turn carrying mentions + resolved attachments + the set id", () => {
      const parsed = ChatMessageSchema.safeParse({
        id: "msg_2",
        role: "user",
        text: "spusť to",
        at: "2026-09-27T10:00:00.000Z",
        mentions: [agent, department],
        attachments: [{ name: "a.txt", size: 12, mediaType: "text/plain" }],
        attachmentSetId: "set_9",
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.mentions).toHaveLength(2);
        expect(parsed.data.attachments?.[0]?.name).toBe("a.txt");
        expect(parsed.data.attachmentSetId).toBe("set_9");
      }
    });
  });
});
