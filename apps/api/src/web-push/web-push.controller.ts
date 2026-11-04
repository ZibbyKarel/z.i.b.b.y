import { Controller, UseGuards } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { webPushContract } from "@zibby/contracts";
import { OperatorTokenGuard } from "../approvals/operator-token.guard";
import { WebPushStore } from "./web-push.store";

/** Implements `webPushContract`; mutations need the operator token (the guard passes GETs). */
@Controller()
@UseGuards(OperatorTokenGuard)
export class WebPushController {
  constructor(private readonly store: WebPushStore) {}

  @TsRestHandler(webPushContract)
  handler() {
    return tsRestHandler(webPushContract, {
      getWebPushPublicKey: async () => ({
        status: 200,
        body: { publicKey: (await this.store.vapid()).publicKey },
      }),
      subscribeWebPush: async ({ body }) => {
        await this.store.add(body);
        return { status: 200 as const, body: { ok: true as const } };
      },
      unsubscribeWebPush: async ({ body }) => {
        await this.store.remove(body.endpoint);
        return { status: 200 as const, body: { ok: true as const } };
      },
    });
  }
}
