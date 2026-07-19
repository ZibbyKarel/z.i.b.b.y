import { describe, expect, it, vi } from "vitest";
import type { Briefing } from "@zibby/contracts";
import { ChatBriefingSinkService } from "./chat-briefing-sink.service";

function makeBriefing(over: Partial<Briefing> = {}): Briefing {
  return {
    generatedAt: "2026-07-19T07:00:00.000Z",
    since: "2026-07-18T07:00:00.000Z",
    headline: "Nothing needs you.",
    nothingNeedsYou: true,
    needsYou: [],
    didForYou: [],
    watching: [],
    engagements: [],
    counts: { runsFinished: 0, runsFailed: 0, parked: 0, approvalsPending: 0, channelItemsNew: 0 },
    ...over,
  };
}

describe("ChatBriefingSinkService (F8a / O6)", () => {
  it("appends an assistant turn carrying the briefing payload to the active conversation", async () => {
    const ensureConversation = vi.fn().mockResolvedValue("conv_active");
    const appendMessage = vi.fn().mockResolvedValue(undefined);
    const store = { ensureConversation, appendMessage };
    const service = new ChatBriefingSinkService(store as never);

    const briefing = makeBriefing();
    await service.announce(briefing);

    expect(ensureConversation).toHaveBeenCalledWith();
    expect(appendMessage).toHaveBeenCalledTimes(1);
    const [conversationId, message] = appendMessage.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(conversationId).toBe("conv_active");
    expect(message).toMatchObject({
      role: "assistant",
      text: briefing.headline,
      at: briefing.generatedAt,
      briefing,
    });
    expect(typeof message.id).toBe("string");
    expect((message.id as string).length).toBeGreaterThan(0);
  });

  it("falls back to the headline as plain text even when needsYou carries structured rows", async () => {
    const appendMessage = vi.fn().mockResolvedValue(undefined);
    const store = { ensureConversation: vi.fn().mockResolvedValue("conv_1"), appendMessage };
    const service = new ChatBriefingSinkService(store as never);

    const briefing = makeBriefing({
      headline: "1 thing needs you — 1 approval.",
      nothingNeedsYou: false,
      needsYou: [
        {
          kind: "approval",
          id: "ap1",
          summary: "Team Slack wants to channel-reply",
          at: "2026-07-19T06:30:00.000Z",
          refs: { approvalId: "ap1" },
        },
      ],
    });
    await service.announce(briefing);

    const [, message] = appendMessage.mock.calls[0] as [string, Record<string, unknown>];
    expect(message.text).toBe("1 thing needs you — 1 approval.");
    expect((message.briefing as Briefing).needsYou).toHaveLength(1);
  });
});
