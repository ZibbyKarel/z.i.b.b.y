import { describe, expect, it } from "vitest";
import type { Briefing } from "../briefing/briefing.schema";
import { ChatMessageSchema, ChatToolEventSchema } from "./chat.schema";

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
    '{"id":"msg_1783361336923_4a34df","role":"assistant","text":"Hotovo, pane — poslal jsem to do práce. Hello World pro Test Projekt teď jede přes Delivery pipeline (běh `delivery_1783361331762`). Výstupy jako obvykle projdou schvalovací branou, takže se na to mrkněte v běhech, až bude hotovo.","at":"2026-07-06T18:08:26.710Z","toolEvents":[{"name":"create_task","status":"ok","callId":"toolu_01AjeamiYhSG6HHQxzD3waDH","summary":"Spustil jsem úkol — pipeline Delivery.","href":"/runs?run=delivery_1783361331762","target":{"kind":"pipeline","id":"delivery","name":"Delivery","glyph":"flow"},"runRef":"delivery_1783361331762","taskId":"task_1783361322706_1b5101"}]}';

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
