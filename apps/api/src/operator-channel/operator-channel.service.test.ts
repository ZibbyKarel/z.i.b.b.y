import { OperatorChannelSettingsSchema } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { FakeOperatorChannel } from "./fake-operator-channel";
import type { OperatorChannel } from "./operator-channel.port";
import { OperatorChannelService } from "./operator-channel.service";

/** A channel whose connect takes a tick (like Slack's REST calls) and that tracks its socket. */
class SlowChannel extends FakeOperatorChannel {
  open = false;
  override async connect(operatorUserId: string) {
    await new Promise((r) => setTimeout(r, 5));
    return super.connect(operatorUserId);
  }
  override async start(handler: Parameters<OperatorChannel["start"]>[0]) {
    this.open = true;
    return super.start(handler);
  }
  override async stop() {
    this.open = false;
    return super.stop();
  }
}

function makeService() {
  const settings = OperatorChannelSettingsSchema.parse({
    enabled: true,
    operatorUserIds: ["U1"],
    dmChannelId: "D-FAKE-U1",
  });
  const store = {
    readSettings: async () => settings,
    writeSettings: async () => undefined,
    recentDeliveries: async () => [],
  };
  const service = new OperatorChannelService(store as never, {} as never);
  const built: SlowChannel[] = [];
  const build = vi.fn(async () => {
    const channel = new SlowChannel();
    built.push(channel);
    return channel;
  });
  Object.assign(service, { build });
  return { service, built, build };
}

describe("OperatorChannelService — one live channel", () => {
  it("concurrent listen() + send() at boot share one channel", async () => {
    const { service, built, build } = makeService();
    await Promise.all([service.listen(async () => {}), service.send({ text: "hi" } as never)]);
    expect(build).toHaveBeenCalledTimes(1);
    expect(built[0]?.open).toBe(true);
  });

  it("reset() and stop() close the socket the listener runs on", async () => {
    const { service, built } = makeService();
    await Promise.all([service.listen(async () => {}), service.send({ text: "hi" } as never)]);
    await service.reset();
    // The old channel is closed; the restarted listener runs on a fresh one.
    expect(built.filter((c) => c.open)).toHaveLength(1);
    expect(built.at(-1)?.open).toBe(true);
    await service.stop();
    expect(built.some((c) => c.open)).toBe(false);
  });
});
