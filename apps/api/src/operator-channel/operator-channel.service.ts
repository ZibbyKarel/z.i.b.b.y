import { Inject, Injectable } from "@nestjs/common";
import type {
  OperatorChannelSettings,
  OperatorChannelStatus,
  OperatorCredentialKind,
} from "@zibby/contracts";
import type { CredentialsStore } from "../integrations/credentials.store";
import { FakeOperatorChannel } from "./fake-operator-channel";
import type {
  MessageRef,
  OperatorChannel,
  OperatorInboundHandler,
  OperatorNotification,
} from "./operator-channel.port";
import { OperatorChannelStore } from "./operator-channel.store";
import { SlackOperatorChannel } from "./slack-operator-channel";

/** DI token: the credentials store instance scoped to `credentials/operator-channel/`. */
export const OPERATOR_CREDENTIALS = "OPERATOR_CREDENTIALS";

/** The fake seam — the harness's `CHANNEL_FAKE_DIR` (always set under test) or `CHANNEL_ADAPTER_MODE=fake`. */
export function operatorChannelFakeMode(): boolean {
  return Boolean(process.env.CHANNEL_FAKE_DIR) || process.env.CHANNEL_ADAPTER_MODE === "fake";
}

const tokenOf = (creds: unknown): string | null =>
  creds && typeof creds === "object" && "token" in creds && typeof creds.token === "string"
    ? creds.token
    : null;

/**
 * Owns the live channel: builds the transport (fake or Slack from the stored tokens),
 * connects it lazily (resolving + persisting the operator DM), and reports status.
 * Any settings/credential change drops the connection so the next send reconnects;
 * the inbound listener (registered once via {@link listen}) is restarted with it.
 * Error text is the transport's own (`<method>: <slack error>`) — never a token.
 */
@Injectable()
export class OperatorChannelService {
  readonly mode: "slack" | "fake" = operatorChannelFakeMode() ? "fake" : "slack";
  /** The offline channel (fake mode); tests read `fake.sent`. */
  readonly fake = new FakeOperatorChannel();
  private channel: OperatorChannel | null = null;
  /** The in-flight (or settled) connect, shared by concurrent callers — one channel, never two. */
  private connecting: Promise<OperatorChannel> | null = null;
  /** The channel the inbound listener was started on (the one holding the socket). */
  private listener: OperatorChannel | null = null;
  /** Bumped on every disconnect, so a connect/listen that settles afterwards is dropped. */
  private generation = 0;
  private workspace: string | undefined;
  private lastError: string | undefined;
  private handler: OperatorInboundHandler | null = null;
  private listening = false;

  constructor(
    private readonly store: OperatorChannelStore,
    @Inject(OPERATOR_CREDENTIALS) private readonly credentials: CredentialsStore,
  ) {}

  /** Forget the connection (settings/token changed) and restart the inbound listener. */
  async reset(): Promise<void> {
    await this.disconnect();
    this.workspace = undefined;
    this.lastError = undefined;
    if (this.handler) await this.listen(this.handler);
  }

  /** Drop the connection and stop every channel it opened (the listener's and the cached one). */
  private async disconnect(): Promise<void> {
    this.generation += 1;
    const pending = this.connecting;
    const listener = this.listener;
    this.connecting = null;
    this.channel = null;
    this.listener = null;
    this.listening = false;
    const channel = await pending?.catch(() => null);
    await listener?.stop();
    if (channel && channel !== listener) await channel.stop();
  }

  async setCredential(kind: OperatorCredentialKind, token: string): Promise<void> {
    await this.credentials.write(kind, { token });
    await this.reset();
  }

  /**
   * Register the inbound handler and, when the channel is enabled, open the
   * transport's listener (Slack: Socket Mode). Never throws — a failure lands in
   * `lastError` and the next {@link reset} (settings/token change) retries.
   */
  async listen(handler: OperatorInboundHandler): Promise<void> {
    this.handler = handler;
    const settings = await this.store.readSettings();
    if (!settings.enabled) return;
    const generation = this.generation;
    try {
      const channel = await this.connected(settings);
      if (generation !== this.generation) return; // reset meanwhile: its own listen() runs
      this.listener = channel;
      await channel.start(handler);
      this.listening = true;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  /** Stop listening for good (module shutdown). */
  async stop(): Promise<void> {
    this.handler = null;
    await this.disconnect();
  }

  private async build(): Promise<OperatorChannel> {
    if (this.mode === "fake") return this.fake;
    const bot = tokenOf(await this.credentials.read("slack-bot"));
    if (!bot) throw new Error("no slack bot token stored");
    return new SlackOperatorChannel(
      bot,
      tokenOf(await this.credentials.read("slack-app")),
      fetch,
      undefined,
      (message) => {
        this.lastError = message;
      },
    );
  }

  /** Connect if needed; concurrent callers share the one in-flight connect (a failure isn't cached). */
  private connected(settings: OperatorChannelSettings): Promise<OperatorChannel> {
    if (!this.connecting) {
      const pending = this.connect(settings);
      this.connecting = pending;
      pending.catch(() => {
        if (this.connecting === pending) this.connecting = null;
      });
    }
    return this.connecting;
  }

  /** Resolve the DM with the first allowlisted operator, persist it. */
  private async connect(settings: OperatorChannelSettings): Promise<OperatorChannel> {
    const generation = this.generation;
    const operator = settings.operatorUserIds[0];
    if (!operator) throw new Error("no operator Slack user id configured");
    try {
      const channel = await this.build();
      const conn = await channel.connect(operator);
      this.workspace = conn.workspace;
      this.lastError = undefined;
      if (settings.dmChannelId !== conn.dmChannelId) {
        await this.store.writeSettings({ ...settings, dmChannelId: conn.dmChannelId });
      }
      if (generation === this.generation) this.channel = channel;
      return channel;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /** Send one notification to the operator DM (connecting first when needed). */
  async send(notification: OperatorNotification): Promise<MessageRef> {
    const channel = await this.connected(await this.store.readSettings());
    try {
      return await channel.send(notification);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /** Replace a sent message (the chat reply's placeholder → milestones → final answer). */
  async update(ref: MessageRef, notification: OperatorNotification): Promise<void> {
    const channel = await this.connected(await this.store.readSettings());
    try {
      await channel.update(ref, notification);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async status(): Promise<OperatorChannelStatus> {
    const settings = await this.store.readSettings();
    const [lastDelivery] = await this.store.recentDeliveries(1);
    return {
      enabled: settings.enabled,
      transport: settings.transport,
      mode: this.mode,
      credentials: {
        bot: await this.credentials.has("slack-bot"),
        app: await this.credentials.has("slack-app"),
      },
      connected: this.channel !== null,
      listening: this.listening,
      ...(this.workspace ? { workspace: this.workspace } : {}),
      dmResolved: Boolean(settings.dmChannelId),
      ...(this.lastError ? { lastError: this.lastError } : {}),
      ...(lastDelivery ? { lastDelivery } : {}),
    };
  }
}
