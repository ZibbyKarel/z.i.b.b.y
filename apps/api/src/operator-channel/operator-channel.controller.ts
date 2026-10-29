import { Controller, UseGuards } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { OperatorChannelSettingsInputSchema, operatorChannelContract } from "@zibby/contracts";
import { OperatorTokenGuard } from "../approvals/operator-token.guard";
import { operatorTokenMatchesKind } from "../integrations/credential-kind";
import { OperatorChannelService } from "./operator-channel.service";
import { OperatorChannelStore } from "./operator-channel.store";
import { OperatorNotifier } from "./operator-notifier.service";

const unprocessable = (message: string) => ({ status: 422 as const, body: { message } });

/**
 * Implements `operatorChannelContract`. Every mutating route needs the operator
 * token (the allowlist and the Slack tokens are permission-grade config — no agent
 * or chat tool may change them). The settings PUT strict-validates (422 on an
 * unknown key) and keeps the bot-resolved `dmChannelId` only while the operator
 * allowlist is unchanged.
 */
@Controller()
@UseGuards(OperatorTokenGuard)
export class OperatorChannelController {
  constructor(
    private readonly store: OperatorChannelStore,
    private readonly channel: OperatorChannelService,
    private readonly notifier: OperatorNotifier,
  ) {}

  @TsRestHandler(operatorChannelContract)
  handler() {
    return tsRestHandler(operatorChannelContract, {
      getOperatorChannelStatus: async () => ({ status: 200, body: await this.channel.status() }),

      getOperatorChannelSettings: async () => ({
        status: 200,
        body: await this.store.readSettings(),
      }),

      setOperatorChannelSettings: async ({ body }) => {
        const parsed = OperatorChannelSettingsInputSchema.safeParse(body);
        if (!parsed.success) return unprocessable("settings have unknown or invalid fields");
        const current = await this.store.readSettings();
        const sameOperator =
          current.operatorUserIds.join(",") === parsed.data.operatorUserIds.join(",");
        const next = await this.store.writeSettings({
          ...parsed.data,
          ...(sameOperator && current.dmChannelId ? { dmChannelId: current.dmChannelId } : {}),
        });
        await this.channel.reset();
        return { status: 200 as const, body: next };
      },

      setOperatorChannelCredential: async ({ params: { kind }, body }) => {
        if (!operatorTokenMatchesKind(kind, body.token)) {
          return unprocessable(`token does not match the ${kind} kind`);
        }
        await this.channel.setCredential(kind, body.token);
        return { status: 200 as const, body: await this.channel.status() };
      },

      testOperatorChannel: async () => ({ status: 200, body: await this.notifier.sendTest() }),
    });
  }
}
