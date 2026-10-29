import { Inject, Injectable } from "@nestjs/common";
import type {
  OperatorChannelSettings,
  OperatorChannelStatus,
  OperatorCredentialKind,
} from "@zibby/contracts";
import type { CredentialsStore } from "../integrations/credentials.store";
import { FakeOperatorChannel } from "./fake-operator-channel";
import type { MessageRef, OperatorChannel, OperatorNotification } from "./operator-channel.port";
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
 * Any settings/credential change drops the connection so the next send reconnects.
 * Error text is the transport's own (`<method>: <slack error>`) — never a token.
 */
@Injectable()
export class OperatorChannelService {
  readonly mode: "slack" | "fake" = operatorChannelFakeMode() ? "fake" : "slack";
  /** The offline channel (fake mode); tests read `fake.sent`. */
  readonly fake = new FakeOperatorChannel();
  private channel: OperatorChannel | null = null;
  private workspace: string | undefined;
  private lastError: string | undefined;

  constructor(
    private readonly store: OperatorChannelStore,
    @Inject(OPERATOR_CREDENTIALS) private readonly credentials: CredentialsStore,
  ) {}

  /** Forget the connection (settings/token changed). */
  reset(): void {
    this.channel = null;
    this.workspace = undefined;
    this.lastError = undefined;
  }

  async setCredential(kind: OperatorCredentialKind, token: string): Promise<void> {
    await this.credentials.write(kind, { token });
    this.reset();
  }

  private async build(): Promise<OperatorChannel> {
    if (this.mode === "fake") return this.fake;
    const bot = tokenOf(await this.credentials.read("slack-bot"));
    if (!bot) throw new Error("no slack bot token stored");
    return new SlackOperatorChannel(bot, tokenOf(await this.credentials.read("slack-app")));
  }

  /** Connect if needed: resolve the DM with the first allowlisted operator, persist it. */
  private async connected(settings: OperatorChannelSettings): Promise<OperatorChannel> {
    if (this.channel) return this.channel;
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
      this.channel = channel;
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
      ...(this.workspace ? { workspace: this.workspace } : {}),
      dmResolved: Boolean(settings.dmChannelId),
      ...(this.lastError ? { lastError: this.lastError } : {}),
      ...(lastDelivery ? { lastDelivery } : {}),
    };
  }
}
