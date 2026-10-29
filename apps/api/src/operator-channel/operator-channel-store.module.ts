import { Module } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { OPERATOR_CHANNEL_DIR, OperatorChannelStore } from "./operator-channel.store";

/** Default dir, anchored to `.zibby/data/operator-channel` (gitignored). */
export function resolveOperatorChannelDir(): string {
  return process.env.OPERATOR_CHANNEL_DIR ?? dataDir("operator-channel");
}

/**
 * The operator-channel store on its own (a leaf), so `IntegrationsModule` can read
 * the bot DM id for the Slack triage adapter's exclusion without importing the
 * operator-channel module, which itself depends on IntegrationsModule.
 */
@Module({
  providers: [
    { provide: OPERATOR_CHANNEL_DIR, useFactory: resolveOperatorChannelDir },
    OperatorChannelStore,
  ],
  exports: [OperatorChannelStore],
})
export class OperatorChannelStoreModule {}
