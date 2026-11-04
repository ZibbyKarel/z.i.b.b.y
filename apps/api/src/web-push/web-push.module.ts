import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { OperatorChannelStoreModule } from "../operator-channel/operator-channel-store.module";
import { OperatorChannelModule } from "../operator-channel/operator-channel.module";
import { dataDir } from "../shared/data-dir";
import { WebPushController } from "./web-push.controller";
import { WEB_PUSH_SENDER, WebPushNotifier, defaultWebPushSender } from "./web-push.notifier";
import { WEB_PUSH_DIR, WebPushStore } from "./web-push.store";

/** Default dir, anchored to `.zibby/data/web-push` (gitignored). */
export function resolveWebPushDir(): string {
  return process.env.WEB_PUSH_DIR ?? dataDir("web-push");
}

/**
 * Browser push: Tier-3 operator events → stored Web Push subscriptions. Imports
 * `OperatorChannelModule` only for its exported `OPERATOR_EVENT_LOOKUPS`.
 */
@Module({
  imports: [ApprovalsModule, OperatorChannelModule, OperatorChannelStoreModule],
  controllers: [WebPushController],
  providers: [
    { provide: WEB_PUSH_DIR, useFactory: resolveWebPushDir },
    { provide: WEB_PUSH_SENDER, useValue: defaultWebPushSender },
    WebPushStore,
    WebPushNotifier,
  ],
})
export class WebPushModule {}
