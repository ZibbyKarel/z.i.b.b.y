import type {
  MessageRef,
  OperatorChannel,
  OperatorChannelConnection,
  OperatorInboundEvent,
  OperatorInboundHandler,
  OperatorNotification,
} from "./operator-channel.port";

/**
 * The offline operator channel — used by tests and whenever the fake channel seam is
 * on (`CHANNEL_FAKE_DIR`, which the test harness always sets, or
 * `CHANNEL_ADAPTER_MODE=fake`). Nothing leaves the process: sends are recorded in
 * {@link sent}, so a test asserts exactly what the operator would have received.
 * {@link failNext} queues errors (e.g. a `RateLimitedError`) for the next sends;
 * {@link receive} plays an inbound event as if Slack had delivered it.
 */
export class FakeOperatorChannel implements OperatorChannel {
  readonly capabilities = { threads: true, buttons: true, edit: true };
  readonly sent: { ref: MessageRef; notification: OperatorNotification }[] = [];
  readonly failNext: Error[] = [];
  handler: OperatorInboundHandler | null = null;
  private seq = 0;
  private dmChannelId = "D-FAKE";

  connect(operatorUserId: string): Promise<OperatorChannelConnection> {
    this.dmChannelId = `D-FAKE-${operatorUserId}`;
    return Promise.resolve({ workspace: "fake", dmChannelId: this.dmChannelId });
  }

  send(notification: OperatorNotification): Promise<MessageRef> {
    const error = this.failNext.shift();
    if (error) return Promise.reject(error);
    this.seq += 1;
    const ref = {
      channel: this.dmChannelId,
      ts: `1700000000.${String(this.seq).padStart(6, "0")}`,
    };
    this.sent.push({ ref, notification });
    return Promise.resolve(ref);
  }

  update(ref: MessageRef, notification: OperatorNotification): Promise<void> {
    const hit = this.sent.find((s) => s.ref.ts === ref.ts);
    if (hit) hit.notification = notification;
    return Promise.resolve();
  }

  start(handler: OperatorInboundHandler): Promise<void> {
    this.handler = handler;
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.handler = null;
    return Promise.resolve();
  }

  /** Deliver an inbound event to the registered handler (no handler → dropped, like a closed socket). */
  async receive(event: OperatorInboundEvent): Promise<void> {
    await this.handler?.(event);
  }
}
