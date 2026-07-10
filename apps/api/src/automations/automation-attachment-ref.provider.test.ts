import type { Automation } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { AutomationAttachmentRefProvider } from "./automation-attachment-ref.provider";

function taskAutomation(over: Partial<Automation> = {}): Automation {
  return {
    id: "prompt-automation",
    trigger: { type: "cron", expr: "0 9 * * *" },
    target: { type: "task", text: "check the inbox" },
    enabled: true,
    system: false,
    ...over,
  };
}

describe("AutomationAttachmentRefProvider", () => {
  it("returns the attachmentSetId of every task-target automation that carries one", async () => {
    const automations: Automation[] = [
      taskAutomation({ id: "a", target: { type: "task", text: "x", attachmentSetId: "set_1" } }),
      taskAutomation({ id: "b", target: { type: "task", text: "y" } }), // no attachments
      { id: "c", trigger: { type: "cron", expr: "0 3 * * *" }, target: { type: "briefing" }, enabled: true, system: true },
      taskAutomation({ id: "d", target: { type: "task", text: "z", attachmentSetId: "set_2" } }),
    ];
    const provider = new AutomationAttachmentRefProvider({
      list: async () => automations,
    } as never);

    expect(await provider.referencedSetIds()).toEqual(["set_1", "set_2"]);
  });

  it("returns an empty list when no automation is a task target with attachments", async () => {
    const provider = new AutomationAttachmentRefProvider({
      list: async () => [
        { id: "x", trigger: { type: "cron", expr: "0 3 * * *" }, target: { type: "memory-distill" }, enabled: true, system: true },
      ],
    } as never);

    expect(await provider.referencedSetIds()).toEqual([]);
  });
});
